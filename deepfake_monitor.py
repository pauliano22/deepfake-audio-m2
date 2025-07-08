# Desktop Background Deepfake Monitor
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
from tkinter import ttk, messagebox, simpledialog
import tkinter.font as tkFont
from PIL import Image, ImageTk
import pystray
from pystray import MenuItem, Menu
import logging
import winsound  # For Windows alert sounds
import requests

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
        
        # Detection settings
        self.alert_threshold = 0.75
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
        
        # Load model
        self.load_model()
        
        # Setup logging
        self.setup_logging()
        
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
        
        logging.basicConfig(
            filename=log_dir / "deepfake_detections.log",
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
    
    def predict_audio_chunk(self, audio_data):
        """Predict if audio chunk contains deepfake"""
        try:
            # Convert audio data to numpy array
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
            audio_np = audio_np / 32768.0  # Normalize
            
            # Check if audio has sufficient volume (avoid processing silence)
            volume = np.sqrt(np.mean(audio_np**2))
            if volume < 0.01:  # Too quiet, likely silence
                return 0.0, "SILENT"
            
            # Save temporary file for feature extraction
            temp_file = "temp_monitor_audio.wav"
            sf.write(temp_file, audio_np, self.RATE)
            
            # Extract features
            features = self.feature_extractor.extract_mel_spectrogram(temp_file)
            
            if features is None:
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
            
            return fake_prob, prediction
            
        except Exception as e:
            print(f"Prediction error: {e}")
            return 0.5, "ERROR"
    
    def audio_monitoring_thread(self):
        """Background thread for audio monitoring"""
        try:
            audio = pyaudio.PyAudio()
            
            # Find the best input device (prefer system audio if available)
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
                    
                    # Trigger alert if needed
                    if fake_prob > self.alert_threshold and prediction == "FAKE":
                        self.trigger_alert(fake_prob)
                    
                    # Log to file
                    if self.log_detections and prediction != "SILENT":
                        logging.info(f"Detection: {prediction} (confidence: {fake_prob:.3f})")
                
                time.sleep(0.1)  # Small delay
                
        except Exception as e:
            print(f"❌ Audio monitoring error: {e}")
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
        """Trigger deepfake detection alert"""
        alert_message = f"🚨 DEEPFAKE DETECTED!\nConfidence: {confidence:.1%}\nTime: {datetime.now().strftime('%H:%M:%S')}"
        
        print(alert_message)
        
        # Sound alert
        if self.alert_sound:
            try:
                # Play system alert sound
                winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS)
            except:
                print("\a")  # Fallback beep
        
        # Popup alert
        if self.alert_popup:
            self.show_alert_popup(alert_message)
        
        # Log alert
        logging.warning(f"DEEPFAKE ALERT: Confidence {confidence:.3f}")
    
    def show_alert_popup(self, message):
        """Show popup alert"""
        try:
            # Create alert window
            alert_window = tk.Toplevel()
            alert_window.title("Deepfake Alert")
            alert_window.geometry("300x150")
            alert_window.configure(bg='#ff4444')
            alert_window.attributes('-topmost', True)
            
            # Alert message
            label = tk.Label(alert_window, text=message, bg='#ff4444', fg='white', 
                           font=('Arial', 12, 'bold'), wraplength=280)
            label.pack(pady=20)
            
            # OK button
            ok_button = tk.Button(alert_window, text="OK", command=alert_window.destroy,
                                bg='white', fg='black', font=('Arial', 10, 'bold'))
            ok_button.pack(pady=10)
            
            # Auto-close after 10 seconds
            alert_window.after(10000, alert_window.destroy)
            
        except Exception as e:
            print(f"Alert popup error: {e}")
    
    def create_settings_window(self):
        """Create settings configuration window"""
        if self.settings_window and self.settings_window.winfo_exists():
            self.settings_window.lift()
            return
        
        self.settings_window = tk.Toplevel()
        self.settings_window.title("Deepfake Monitor Settings")
        self.settings_window.geometry("400x500")
        self.settings_window.resizable(False, False)
        
        # Detection Settings
        settings_frame = ttk.LabelFrame(self.settings_window, text="Detection Settings", padding=10)
        settings_frame.pack(fill="x", padx=10, pady=5)
        
        # Alert threshold
        ttk.Label(settings_frame, text="Alert Threshold:").pack(anchor="w")
        threshold_frame = ttk.Frame(settings_frame)
        threshold_frame.pack(fill="x", pady=5)
        
        self.threshold_var = tk.DoubleVar(value=self.alert_threshold)
        threshold_scale = ttk.Scale(threshold_frame, from_=0.5, to=0.95, 
                                  variable=self.threshold_var, orient="horizontal")
        threshold_scale.pack(side="left", fill="x", expand=True)
        
        threshold_label = ttk.Label(threshold_frame, text=f"{self.alert_threshold:.2f}")
        threshold_label.pack(side="right")
        
        def update_threshold_label(event=None):
            threshold_label.config(text=f"{self.threshold_var.get():.2f}")
        threshold_scale.configure(command=update_threshold_label)
        
        # Sensitivity
        ttk.Label(settings_frame, text="Sensitivity:").pack(anchor="w", pady=(10,0))
        sensitivity_frame = ttk.Frame(settings_frame)
        sensitivity_frame.pack(fill="x", pady=5)
        
        self.sensitivity_var = tk.StringVar(value=self.sensitivity)
        for sens in ["Low", "Medium", "High"]:
            ttk.Radiobutton(sensitivity_frame, text=sens, variable=self.sensitivity_var, 
                          value=sens).pack(side="left")
        
        # Alert Settings
        alert_frame = ttk.LabelFrame(self.settings_window, text="Alert Settings", padding=10)
        alert_frame.pack(fill="x", padx=10, pady=5)
        
        self.sound_var = tk.BooleanVar(value=self.alert_sound)
        ttk.Checkbutton(alert_frame, text="Play alert sound", variable=self.sound_var).pack(anchor="w")
        
        self.popup_var = tk.BooleanVar(value=self.alert_popup)
        ttk.Checkbutton(alert_frame, text="Show popup alerts", variable=self.popup_var).pack(anchor="w")
        
        self.log_var = tk.BooleanVar(value=self.log_detections)
        ttk.Checkbutton(alert_frame, text="Log detections to file", variable=self.log_var).pack(anchor="w")
        
        # Detection History
        history_frame = ttk.LabelFrame(self.settings_window, text="Recent Detections", padding=10)
        history_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        # Create treeview for history
        columns = ('Time', 'Prediction', 'Confidence')
        history_tree = ttk.Treeview(history_frame, columns=columns, show='headings', height=8)
        
        for col in columns:
            history_tree.heading(col, text=col)
            history_tree.column(col, width=120)
        
        # Scrollbar
        scrollbar = ttk.Scrollbar(history_frame, orient="vertical", command=history_tree.yview)
        history_tree.configure(yscrollcommand=scrollbar.set)
        
        history_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Populate history
        for detection in self.detection_history[-20:]:  # Show last 20
            time_str = datetime.fromisoformat(detection['timestamp']).strftime('%H:%M:%S')
            confidence_str = f"{detection['confidence']:.3f}"
            history_tree.insert('', 'end', values=(time_str, detection['prediction'], confidence_str))
        
        # Buttons
        button_frame = ttk.Frame(self.settings_window)
        button_frame.pack(fill="x", padx=10, pady=5)
        
        def save_settings():
            self.alert_threshold = self.threshold_var.get()
            self.sensitivity = self.sensitivity_var.get()
            self.alert_sound = self.sound_var.get()
            self.alert_popup = self.popup_var.get()
            self.log_detections = self.log_var.get()
            
            # Save to config file
            self.save_config()
            messagebox.showinfo("Settings", "Settings saved successfully!")
        
        ttk.Button(button_frame, text="Save Settings", command=save_settings).pack(side="right", padx=5)
        ttk.Button(button_frame, text="Close", command=self.settings_window.destroy).pack(side="right")
    
    def save_config(self):
        """Save configuration to file"""
        config = {
            'alert_threshold': self.alert_threshold,
            'sensitivity': self.sensitivity,
            'alert_sound': self.alert_sound,
            'alert_popup': self.alert_popup,
            'log_detections': self.log_detections
        }
        
        with open('deepfake_monitor_config.json', 'w') as f:
            json.dump(config, f, indent=2)
    
    def load_config(self):
        """Load configuration from file"""
        try:
            with open('deepfake_monitor_config.json', 'r') as f:
                config = json.load(f)
                
            self.alert_threshold = config.get('alert_threshold', 0.75)
            self.sensitivity = config.get('sensitivity', 'Medium')
            self.alert_sound = config.get('alert_sound', True)
            self.alert_popup = config.get('alert_popup', True)
            self.log_detections = config.get('log_detections', True)
            
        except FileNotFoundError:
            # Use defaults
            pass
    
    def create_system_tray(self):
        """Create system tray icon"""
        # Create icon (you can replace with custom icon file)
        icon_image = Image.new('RGB', (64, 64), color='red')
        
        menu = Menu(
            MenuItem("🎤 Start Monitoring", self.start_monitoring, enabled=lambda item: not self.is_monitoring),
            MenuItem("⏹️ Stop Monitoring", self.stop_monitoring, enabled=lambda item: self.is_monitoring),
            Menu.SEPARATOR,
            MenuItem("⚙️ Settings", self.show_settings),
            MenuItem("📊 View History", self.show_history),
            Menu.SEPARATOR,
            MenuItem("❌ Exit", self.quit_application)
        )
        
        self.tray_icon = pystray.Icon("deepfake_monitor", icon_image, "Deepfake Monitor", menu)
    
    def start_monitoring(self, icon=None, item=None):
        """Start deepfake monitoring"""
        if not self.is_monitoring:
            self.is_monitoring = True
            
            # Start monitoring thread
            monitor_thread = threading.Thread(target=self.audio_monitoring_thread, daemon=True)
            monitor_thread.start()
            
            print("🎤 Deepfake monitoring started!")
            
            if self.tray_icon:
                self.tray_icon.notify("Deepfake monitoring started!", "Now monitoring audio for AI-generated speech")
    
    def stop_monitoring(self, icon=None, item=None):
        """Stop deepfake monitoring"""
        if self.is_monitoring:
            self.is_monitoring = False
            print("⏹️ Deepfake monitoring stopped!")
            
            if self.tray_icon:
                self.tray_icon.notify("Monitoring stopped", "Deepfake detection paused")
    
    def show_settings(self, icon=None, item=None):
        """Show settings window"""
        if not self.root:
            self.root = tk.Tk()
            self.root.withdraw()  # Hide main window
        
        self.create_settings_window()
    
    def show_history(self, icon=None, item=None):
        """Show detection history"""
        history_text = "Recent Detections:\n\n"
        
        for detection in self.detection_history[-10:]:
            time_str = datetime.fromisoformat(detection['timestamp']).strftime('%H:%M:%S')
            history_text += f"{time_str}: {detection['prediction']} ({detection['confidence']:.3f})\n"
        
        if not self.root:
            self.root = tk.Tk()
            self.root.withdraw()
        
        messagebox.showinfo("Detection History", history_text)
    
    def quit_application(self, icon=None, item=None):
        """Quit the application"""
        self.stop_monitoring()
        if self.tray_icon:
            self.tray_icon.stop()
        if self.root:
            self.root.quit()
        sys.exit(0)
    
    def run(self):
        """Run the deepfake monitor application"""
        print("🚀 Starting Deepfake Monitor...")
        
        # Load configuration
        self.load_config()
        
        # Create system tray
        self.create_system_tray()
        
        # Start system tray (this blocks)
        self.tray_icon.run()

def main():
    """Main entry point"""
    try:
        monitor = DeepfakeMonitor()
        monitor.run()
    except KeyboardInterrupt:
        print("\n⏹️ Application interrupted")
    except Exception as e:
        print(f"❌ Application error: {e}")

if __name__ == "__main__":
    main()