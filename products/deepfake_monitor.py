# Desktop Background Deepfake Monitor - WORKING VERSION
# A system tray application that monitors all audio and alerts on deepfakes

import sys
import os
import time
import threading
import queue
import json
from pathlib import Path
import numpy as np
import torch
import librosa
import soundfile as sf
import pyaudio
from datetime import datetime
import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
import pystray
from pystray import MenuItem, Menu
import logging
import winsound
import traceback

# Import our trained model components
from deepfake_detector import DeepfakeDetectorCNN, AudioFeatureExtractor

class DeepfakeMonitor:
    """Background deepfake detection system"""
    
    def __init__(self):
        self.is_monitoring = False
        self.model = None
        self.feature_extractor = None
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Audio settings
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 22050
        self.CHUNK = 1024
        self.RECORD_SECONDS = 3
        
        # Detection settings - LOWERED thresholds for better detection
        self.alert_threshold = 0.6  # LOWERED from 0.75
        self.sensitivity = "Medium"
        self.alert_sound = True
        self.alert_popup = True
        self.log_detections = True
        
        # Audio processing
        self.audio_queue = queue.Queue()
        self.detection_history = []
        
        # GUI components
        self.root = None
        self.tray_icon = None
        self.settings_window = None
        
        # Thread-safe GUI queue
        self.gui_queue = queue.Queue()
        
        # Load model
        self.load_model()
        
        # Setup logging
        self.setup_logging()
        
        # Try to install plyer for better notifications
        self.install_plyer_if_needed()
    
    def load_model(self):
        """Load the trained deepfake detection model"""
        try:
            model_path = 'models/best_deepfake_detector.pth'
            if not os.path.exists(model_path):
                raise FileNotFoundError("Model not found! Please train the model first.")
            
            self.model = DeepfakeDetectorCNN()
            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
            self.model.eval()
            self.model.to(self.device)
            
            self.feature_extractor = AudioFeatureExtractor()
            print("✅ Model loaded successfully!")
            
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            sys.exit(1)
    
    def setup_logging(self):
        """Setup detection logging"""
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        # Clear previous logging configuration
        for handler in logging.root.handlers[:]:
            logging.root.removeHandler(handler)
        
        logging.basicConfig(
            filename=log_dir / "deepfake_detections.log",
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            filemode='a'
        )
        
        # Also log to console
        console = logging.StreamHandler()
        console.setLevel(logging.INFO)
        formatter = logging.Formatter('%(levelname)s - %(message)s')
        console.setFormatter(formatter)
        logging.getLogger('').addHandler(console)
    
    def predict_audio_chunk(self, audio_data):
        """Predict if audio chunk contains deepfake"""
        try:
            # Convert audio data to numpy array
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
            audio_np = audio_np / 32768.0  # Normalize
            
            # Check if audio has sufficient volume
            volume = np.sqrt(np.mean(audio_np**2))
            print(f"🔊 Audio volume: {volume:.4f}")
            
            if volume < 0.005:
                print("🔇 Audio too quiet, skipping...")
                return 0.0, "SILENT"
            
            # Save temporary file for feature extraction
            temp_file = "temp_monitor_audio.wav"
            sf.write(temp_file, audio_np, self.RATE)
            
            # Extract features
            features = self.feature_extractor.extract_mel_spectrogram(temp_file)
            
            if features is None:
                print("❌ Feature extraction failed")
                return 0.5, "ERROR"
            
            # Predict
            features_tensor = torch.FloatTensor(features).unsqueeze(0).unsqueeze(0)
            features_tensor = features_tensor.to(self.device)
            
            with torch.no_grad():
                outputs = self.model(features_tensor)
                probabilities = torch.softmax(outputs, dim=1)
                fake_prob = probabilities[0][1].item()
                
                prediction = "FAKE" if fake_prob > 0.5 else "REAL"
            
            # Cleanup
            if os.path.exists(temp_file):
                os.remove(temp_file)
            
            print(f"🎯 Prediction: {prediction} (confidence: {fake_prob:.3f})")
            
            return fake_prob, prediction
            
        except Exception as e:
            print(f"❌ Prediction error: {e}")
            return 0.5, "ERROR"
    
    def audio_monitoring_thread(self):
        """Background thread for audio monitoring - FIXED"""
        try:
            audio = pyaudio.PyAudio()
            
            # Find the best input device
            input_device = self.find_best_input_device(audio)
            
            stream = audio.open(
                format=self.FORMAT,
                channels=self.CHANNELS,
                rate=self.RATE,
                input=True,
                input_device_index=input_device,
                frames_per_buffer=self.CHUNK
            )
            
            print(f"🎤 Monitoring audio on device {input_device}...")
            
            chunk_count = 0
            
            while self.is_monitoring:
                # Collect audio frames
                audio_frames = []
                frames_needed = int(self.RATE * self.RECORD_SECONDS / self.CHUNK)
                
                for _ in range(frames_needed):
                    if not self.is_monitoring:
                        break
                    try:
                        data = stream.read(self.CHUNK, exception_on_overflow=False)
                        audio_frames.append(data)
                    except Exception as e:
                        print(f"Audio read error: {e}")
                        break
                
                if audio_frames and self.is_monitoring:
                    chunk_count += 1
                    print(f"\n🔄 Processing audio chunk #{chunk_count}")
                    
                    audio_data = b''.join(audio_frames)
                    fake_prob, prediction = self.predict_audio_chunk(audio_data)
                    
                    # Log detection
                    detection = {
                        'timestamp': datetime.now().isoformat(),
                        'prediction': prediction,
                        'confidence': fake_prob,
                        'alert_triggered': fake_prob > self.alert_threshold
                    }
                    
                    self.detection_history.append(detection)
                    
                    # Keep only last 100 detections in memory
                    if len(self.detection_history) > 100:
                        self.detection_history.pop(0)
                    
                    # TRIGGER ALERT - FIXED METHOD NAME
                    if prediction == "FAKE" and fake_prob > self.alert_threshold:
                        print(f"🚨 ALERT TRIGGERED! Fake probability: {fake_prob:.3f}")
                        # Use the correct method name
                        self.trigger_alert(fake_prob)
                    
                    # Log to file
                    if self.log_detections and prediction != "SILENT":
                        logging.info(f"Detection: {prediction} (confidence: {fake_prob:.3f})")
                
                time.sleep(0.1)
                
        except Exception as e:
            print(f"❌ Audio monitoring error: {e}")
            traceback.print_exc()
        finally:
            if 'stream' in locals():
                stream.stop_stream()
                stream.close()
            if 'audio' in locals():
                audio.terminate()
    
    def find_best_input_device(self, audio):
        """Find the best audio input device"""
        device_count = audio.get_device_count()
        
        # Look for system audio or stereo mix first
        for i in range(device_count):
            info = audio.get_device_info_by_index(i)
            if info['maxInputChannels'] > 0:
                name = info['name'].lower()
                if any(keyword in name for keyword in ['stereo mix', 'what u hear', 'system audio']):
                    print(f"📻 Using system audio device: {info['name']}")
                    return i
        
        # Fallback to default microphone
        default_device = audio.get_default_input_device_info()
        print(f"🎤 Using default microphone: {default_device['name']}")
        return default_device['index']
    
    def trigger_alert(self, confidence):
        """Trigger deepfake detection alert - FIXED VERSION"""
        alert_message = f"🚨 DEEPFAKE DETECTED!\nConfidence: {confidence:.1%}\nTime: {datetime.now().strftime('%H:%M:%S')}"
        
        print(alert_message)
        print("=" * 50)
        print("🚨 DEEPFAKE ALERT! 🚨")
        print(f"Confidence: {confidence:.1%}")
        print(f"Time: {datetime.now().strftime('%H:%M:%S')}")
        print("=" * 50)
        
        # Sound alert (safe to call from any thread)
        if self.alert_sound:
            try:
                # Play system alert sound in a separate thread
                def play_sound():
                    try:
                        winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS)
                    except:
                        # Fallback beep
                        for _ in range(3):  # Triple beep
                            winsound.Beep(1000, 200)
                            time.sleep(0.1)
                
                threading.Thread(target=play_sound, daemon=True).start()
            except Exception as e:
                print(f"Sound alert failed: {e}")
        
        # Log alert
        logging.warning(f"DEEPFAKE ALERT: Confidence {confidence:.3f}")
        
        # System tray notification (FIXED - removed timeout parameter)
        if self.tray_icon:
            try:
                def send_notification():
                    try:
                        self.tray_icon.notify(
                            title="🚨 Deepfake Detected!",
                            message=f"AI-generated voice detected with {confidence:.1%} confidence"
                            # Removed timeout parameter - not supported
                        )
                    except Exception as e:
                        print(f"System tray notification failed: {e}")
                
                # Send notification in separate thread
                threading.Thread(target=send_notification, daemon=True).start()
            except Exception as e:
                print(f"Notification setup failed: {e}")
        
        # Windows 10/11 Toast Notification (additional alert method)
        try:
            self.show_windows_toast(confidence)
        except Exception as e:
            print(f"Toast notification failed: {e}")
        
        # Desktop popup as last resort (thread-safe version)
        if self.alert_popup:
            try:
                self.show_thread_safe_popup(confidence)
            except Exception as e:
                print(f"Popup alert failed: {e}")

    def show_windows_toast(self, confidence):
        """Show Windows 10/11 toast notification"""
        try:
            # Try using plyer for cross-platform notifications
            from plyer import notification
            
            notification.notify(
                title="🚨 Deepfake Detected!",
                message=f"AI-generated voice detected with {confidence:.1%} confidence",
                app_name="Deepfake Monitor",
                timeout=10
            )
        except ImportError:
            # Fallback: Use Windows built-in notification
            try:
                import subprocess
                
                # PowerShell command to show toast notification
                ps_script = f'''
                [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
                $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
                $xml = [xml] $template.GetXml()
                $xml.toast.visual.binding.text[0].AppendChild($xml.CreateTextNode("🚨 Deepfake Detected!")) | Out-Null
                $xml.toast.visual.binding.text[1].AppendChild($xml.CreateTextNode("AI voice detected: {confidence:.1%} confidence")) | Out-Null
                $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
                [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Deepfake Monitor").Show($toast)
                '''
                
                subprocess.run(['powershell', '-Command', ps_script], 
                             capture_output=True, shell=True)
            except Exception as e:
                print(f"Windows toast notification failed: {e}")

    def show_thread_safe_popup(self, confidence):
        """Show popup in a thread-safe way"""
        def show_popup():
            try:
                # Create a new root window for the popup
                popup_root = tk.Tk()
                popup_root.withdraw()  # Hide main window
                
                # Show message box
                messagebox.showwarning(
                    "🚨 Deepfake Detected!",
                    f"AI-generated voice detected!\n\nConfidence: {confidence:.1%}\nTime: {datetime.now().strftime('%H:%M:%S')}\n\nThis audio may not be authentic."
                )
                
                popup_root.destroy()
            except Exception as e:
                print(f"Thread-safe popup failed: {e}")
        
        # Run popup in separate thread
        threading.Thread(target=show_popup, daemon=True).start()
    
    def install_plyer_if_needed(self):
        """Install plyer for better notifications"""
        try:
            import plyer
        except ImportError:
            print("📦 Installing plyer for better notifications...")
            try:
                import subprocess
                import sys
                subprocess.check_call([sys.executable, "-m", "pip", "install", "plyer"])
                print("✅ Plyer installed successfully!")
            except Exception as e:
                print(f"⚠️ Could not install plyer: {e}")
    
    def create_system_tray(self):
        """Create system tray icon"""
        # Create icon
        icon_image = Image.new('RGB', (64, 64), color='red')
        
        menu = Menu(
            MenuItem("🎤 Start Monitoring", self.start_monitoring, 
                    enabled=lambda item: not self.is_monitoring),
            MenuItem("⏹️ Stop Monitoring", self.stop_monitoring, 
                    enabled=lambda item: self.is_monitoring),
            Menu.SEPARATOR,
            MenuItem("🧪 Test Alerts", self.test_alert),  # NEW: Test alert function
            MenuItem("⚙️ Settings", self.show_settings),
            MenuItem("📊 View Log File", self.open_log_file),
            Menu.SEPARATOR,
            MenuItem("❌ Exit", self.quit_application)
        )
        
        self.tray_icon = pystray.Icon("deepfake_monitor", icon_image, "Deepfake Monitor", menu)
    
    def test_alert(self, icon=None, item=None):
        """Test all alert systems - FIXED VERSION"""
        print("🧪 Testing alert system...")
        confidence = 0.95
        
        print("Testing console alert...")
        print(f"🚨 TEST ALERT: {confidence:.1%} confidence")
        
        print("Testing sound alert...")
        if self.alert_sound:
            try:
                winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS)
            except:
                winsound.Beep(1000, 500)
        
        print("Testing system tray notification...")
        if self.tray_icon:
            try:
                # FIXED - removed timeout parameter
                self.tray_icon.notify(
                    "🧪 Test Alert",
                    f"This is a test notification with {confidence:.1%} confidence"
                )
            except Exception as e:
                print(f"System tray test failed: {e}")
        
        print("Testing full alert system...")
        self.trigger_alert(confidence)

    def start_monitoring(self, icon=None, item=None):
        """Start deepfake monitoring"""
        if not self.is_monitoring:
            self.is_monitoring = True
            
            # Start monitoring thread
            monitor_thread = threading.Thread(target=self.audio_monitoring_thread, daemon=True)
            monitor_thread.start()
            
            print("🎤 Deepfake monitoring started!")
            print(f"🎯 Alert threshold: {self.alert_threshold}")
            
            if self.tray_icon:
                try:
                    self.tray_icon.notify("Monitoring Started!", 
                                        f"Now detecting deepfakes (threshold: {self.alert_threshold})")
                except:
                    pass
    
    def stop_monitoring(self, icon=None, item=None):
        """Stop deepfake monitoring"""
        if self.is_monitoring:
            self.is_monitoring = False
            print("⏹️ Deepfake monitoring stopped!")
            
            if self.tray_icon:
                try:
                    self.tray_icon.notify("Monitoring Stopped", "Deepfake detection paused")
                except:
                    pass
    
    def show_settings(self, icon=None, item=None):
        """Show settings window"""
        # Simple settings display for now
        current_settings = f"""
Current Settings:
- Alert Threshold: {self.alert_threshold}
- Alert Sound: {self.alert_sound}
- Log Detections: {self.log_detections}

Recent Detections: {len(self.detection_history)}
        """
        print(current_settings)
        
        if self.tray_icon:
            try:
                self.tray_icon.notify("Settings", f"Threshold: {self.alert_threshold}")
            except:
                pass
    
    def open_log_file(self, icon=None, item=None):
        """Open log file"""
        try:
            log_file = Path("logs/deepfake_detections.log")
            if log_file.exists():
                os.startfile(str(log_file))
            else:
                print("No log file found")
                if self.tray_icon:
                    try:
                        self.tray_icon.notify("No Log File", "No detections logged yet")
                    except:
                        pass
        except Exception as e:
            print(f"Error opening log file: {e}")
    
    def quit_application(self, icon=None, item=None):
        """Quit the application - FIXED VERSION"""
        print("👋 Shutting down...")
        self.stop_monitoring()
        
        if self.tray_icon:
            try:
                # Don't set visible = False, just stop
                self.tray_icon.stop()
            except:
                pass
        
        # Use os._exit instead of sys.exit to avoid SystemExit errors
        import os
        os._exit(0)
    
    def run(self):
        """Run the deepfake monitor application"""
        print("🚀 Starting Deepfake Monitor...")
        print(f"🎯 Alert threshold: {self.alert_threshold}")
        print("📋 Right-click system tray icon to start monitoring")
        
        # Create system tray
        self.create_system_tray()
        
        # Start system tray (this blocks)
        try:
            self.tray_icon.run()
        except Exception as e:
            print(f"System tray error: {e}")
            # Fallback: run without system tray
            print("Running in console mode...")
            self.console_mode()
    
    def console_mode(self):
        """Fallback console mode if system tray fails"""
        print("\n📟 Console Mode")
        print("Commands: start, stop, test, quit")
        
        while True:
            try:
                cmd = input("\n> ").lower().strip()
                
                if cmd == "start":
                    self.start_monitoring()
                elif cmd == "stop":
                    self.stop_monitoring()
                elif cmd == "test":
                    self.test_alert()
                elif cmd in ["quit", "exit", "q"]:
                    break
                elif cmd == "status":
                    print(f"Monitoring: {self.is_monitoring}")
                    print(f"Detections: {len(self.detection_history)}")
                else:
                    print("Commands: start, stop, test, status, quit")
                    
            except KeyboardInterrupt:
                break
        
        self.quit_application()

def main():
    """Main entry point"""
    try:
        monitor = DeepfakeMonitor()
        monitor.run()
    except KeyboardInterrupt:
        print("\n⏹️ Application interrupted")
    except Exception as e:
        print(f"❌ Application error: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    main()