# Desktop Deepfake Monitor - Streaming API Version
# A system tray application that monitors all system audio and detects deepfakes in real-time

import sys
import os
import time
import threading
import queue
import json
import wave
import io
from pathlib import Path
import numpy as np
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
import requests
import tempfile

class StreamingDeepfakeMonitor:
    """Real-time streaming deepfake detection system"""
    
    def __init__(self):
        self.is_monitoring = False
        
        # Audio settings - optimized for maximum detection accuracy
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 22050  # High quality for better detection
        self.CHUNK = 4096  # Larger chunks for smoother capture
        self.STREAM_INTERVAL = 0.5  # Stream every 500ms (faster detection)
        self.BUFFER_DURATION = 8.0  # Keep 8 seconds of audio for more context
        
        # API settings
        self.HF_API_URL = 'https://pauliano22-deepfake-audio-detector.hf.space/gradio_api'
        self.MIN_VOLUME_THRESHOLD = 0.0001  # Much more sensitive
        
        # Detection settings - optimized for catching more deepfakes
        self.alert_threshold = 0.3  # Lower threshold = more sensitive
        self.sensitivity = "High"
        self.alert_sound = False  # Disabled audio alerts to prevent annoyance
        self.alert_popup = True
        self.log_detections = True
        
        # Streaming audio buffer
        self.streaming_buffer = []
        self.buffer_duration = 0.0
        self.buffer_lock = threading.Lock()
        
        # Detection tracking - smart alert management
        self.detection_history = []
        self.recent_detections = []
        self.last_alert_time = 0
        self.alert_cooldown = 10.0  # 10 second cooldown between different detection events
        self.consecutive_detections = 0
        self.in_detection_event = False
        self.detection_event_start = 0
        
        # Performance tracking
        self.total_detections = 0
        self.detection_latency = []
        
        # GUI components
        self.tray_icon = None
        self.settings_window = None
        
        # Auto-start status
        self.auto_start_enabled = self.check_auto_start_enabled()
        
        # Setup logging
        self.setup_logging()
        
        # Install dependencies
        self.install_dependencies()
    
    def install_dependencies(self):
        """Install required packages if missing"""
        packages = ['requests', 'plyer']
        
        for package in packages:
            try:
                __import__(package)
            except ImportError:
                print(f"📦 Installing {package}...")
                try:
                    import subprocess
                    subprocess.check_call([sys.executable, "-m", "pip", "install", package])
                    print(f"✅ {package} installed successfully!")
                except Exception as e:
                    print(f"⚠️ Could not install {package}: {e}")
    
    def check_auto_start_enabled(self):
        """Check if auto-start is enabled in Windows registry"""
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, 
                               r"Software\Microsoft\Windows\CurrentVersion\Run")
            try:
                winreg.QueryValueEx(key, "Lion-AI-Detection")
                winreg.CloseKey(key)
                return True
            except FileNotFoundError:
                winreg.CloseKey(key)
                return False
        except Exception:
            return False
    
    def enable_auto_start(self):
        """Add to Windows startup (auto-start with Windows)"""
        try:
            import winreg
            import sys
            
            # Get the path to the current executable
            if getattr(sys, 'frozen', False):
                # Running as compiled executable
                exe_path = sys.executable
            else:
                # Running as Python script (for development)
                exe_path = f'"{sys.executable}" "{os.path.abspath(__file__)}"'
            
            # Add to Windows registry
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                               r"Software\Microsoft\Windows\CurrentVersion\Run",
                               0, winreg.KEY_SET_VALUE)
            
            winreg.SetValueEx(key, "Lion-AI-Detection", 0, winreg.REG_SZ, exe_path)
            winreg.CloseKey(key)
            
            self.auto_start_enabled = True
            print("✅ Auto-start enabled - Lion AI Detection will start with Windows")
            return True
            
        except Exception as e:
            print(f"❌ Failed to enable auto-start: {e}")
            return False
    
    def disable_auto_start(self):
        """Remove from Windows startup"""
        try:
            import winreg
            
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                               r"Software\Microsoft\Windows\CurrentVersion\Run",
                               0, winreg.KEY_SET_VALUE)
            
            winreg.DeleteValue(key, "Lion-AI-Detection")
            winreg.CloseKey(key)
            
            self.auto_start_enabled = False
            print("✅ Auto-start disabled")
            return True
            
        except Exception as e:
            print(f"❌ Failed to disable auto-start: {e}")
            return False
    
    def toggle_auto_start(self, icon=None, item=None):
        """Toggle auto-start setting"""
        if self.auto_start_enabled:
            if self.disable_auto_start():
                if self.tray_icon:
                    try:
                        self.tray_icon.notify("Auto-Start Disabled", 
                                            "Lion AI Detection won't start with Windows")
                    except:
                        pass
        else:
            if self.enable_auto_start():
                if self.tray_icon:
                    try:
                        self.tray_icon.notify("Auto-Start Enabled", 
                                            "Lion AI Detection will start with Windows")
                    except:
                        pass
    
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
    
    def show_first_time_setup(self):
        """Show first-time setup GUI dialog"""
        try:
            # Check if this is first run
            setup_file = Path("setup_complete.txt")
            if setup_file.exists():
                return  # Setup already shown
            
            # Create hidden root window
            root = tk.Tk()
            root.withdraw()
            
            # Show welcome dialog
            setup_message = """🦁 Welcome to Lion - AI Detection!

IMPORTANT SETUP STEPS:

1️⃣ Enable System Audio Capture:
   • Right-click speaker icon in taskbar
   • Select 'Open Sound settings'
   • Click 'Sound Control Panel'
   • Go to 'Recording' tab
   • Enable 'Stereo Mix' (if available)

2️⃣ Start Protection:
   • Right-click the Lion icon in system tray
   • Select 'Start Real-Time Monitoring'

3️⃣ Optional Settings:
   • Enable 'Start with Windows' for automatic protection
   • Adjust alert sensitivity in Settings

Click OK to continue to the system tray."""
            
            messagebox.showinfo("🦁 Lion - First Time Setup", setup_message)
            
            # Mark setup as complete
            setup_file.write_text("setup_complete")
            
            root.destroy()
            
        except Exception as e:
            print(f"Setup dialog error: {e}")
            # Fallback to console
            print("\n" + "="*60)
            print("🦁 Welcome to Lion - AI Detection Monitor!")
            print("="*60)
            print("📋 First-time setup instructions:")
            print("   1. Enable 'Stereo Mix' in Windows Sound settings")
            print("   2. Right-click the system tray icon to start monitoring")
            print("   3. Configure alert settings from the context menu")
            print("="*60)

    def show_system_audio_help(self, icon=None, item=None):
        """Show system audio setup help"""
        try:
            root = tk.Tk()
            root.withdraw()
            
            help_message = """🎤 System Audio Setup Help

To detect AI voices in system audio:

OPTION 1 - Enable Stereo Mix:
1. Right-click speaker icon → Open Sound settings
2. Click 'Sound Control Panel' 
3. Go to 'Recording' tab
4. Right-click empty space → Show Disabled Devices
5. Enable 'Stereo Mix' → Set as Default

OPTION 2 - Use Virtual Audio Cable:
1. Download VB-Cable or similar virtual audio driver
2. Set VB-Cable as default audio output
3. Lion will capture from VB-Cable input

OPTION 3 - Microphone Only:
Lion will monitor your microphone for AI voices in calls.

Need help? Visit our support page or contact us."""
            
            messagebox.showinfo("🎤 Audio Setup Help", help_message)
            root.destroy()
            
        except Exception as e:
            print(f"Help dialog error: {e}")
    
    def create_wav_blob(self, audio_data, sample_rate):
        """Create WAV file from audio data"""
        # Convert to 16-bit PCM
        audio_int16 = (audio_data * 32767).astype(np.int16)
        
        # Create WAV file in memory
        wav_buffer = io.BytesIO()
        
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_int16.tobytes())
        
        wav_buffer.seek(0)
        return wav_buffer.getvalue()
    
    async def send_to_streaming_api(self, audio_blob):
        """Send audio to Hugging Face API for analysis"""
        try:
            # Create temporary file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                tmp_file.write(audio_blob)
                tmp_file_path = tmp_file.name
            
            try:
                # Upload file
                with open(tmp_file_path, 'rb') as f:
                    files = {'files': ('audio.wav', f, 'audio/wav')}
                    upload_response = requests.post(
                        f"{self.HF_API_URL}/upload",
                        files=files,
                        timeout=10
                    )
                
                if not upload_response.ok:
                    raise Exception(f"Upload failed: {upload_response.status_code}")
                
                upload_result = upload_response.json()
                file_path = upload_result[0]
                
                # Make prediction
                prediction_data = {
                    "data": [{
                        "path": file_path,
                        "meta": {"_type": "gradio.FileData"}
                    }]
                }
                
                prediction_response = requests.post(
                    f"{self.HF_API_URL}/call/predict",
                    json=prediction_data,
                    timeout=10
                )
                
                if not prediction_response.ok:
                    raise Exception(f"Prediction failed: {prediction_response.status_code}")
                
                prediction_result = prediction_response.json()
                event_id = prediction_result.get('event_id')
                
                if not event_id:
                    raise Exception("No event ID received")
                
                # Poll for results
                result = await self.poll_streaming_results(event_id)
                return self.parse_streaming_result(result)
                
            finally:
                # Cleanup temp file
                try:
                    os.unlink(tmp_file_path)
                except:
                    pass
                    
        except Exception as e:
            print(f"❌ API error: {e}")
            return {'error': str(e)}
    
    async def poll_streaming_results(self, event_id):
        """Poll for API results"""
        import asyncio
        max_attempts = 15
        
        for attempt in range(max_attempts):
            try:
                response = requests.get(
                    f"{self.HF_API_URL}/call/predict/{event_id}",
                    timeout=5,
                    stream=True
                )
                
                if not response.ok:
                    await asyncio.sleep(0.5)
                    continue
                
                # Process streaming response
                for line in response.iter_lines():
                    if line:
                        line_str = line.decode('utf-8')
                        if line_str.startswith('data: '):
                            try:
                                data = json.loads(line_str[6:])
                                
                                if isinstance(data, list) and len(data) > 0:
                                    return data[0]
                                
                                if isinstance(data, dict) and data.get('msg') == 'process_completed':
                                    if data.get('output') and data['output'].get('data'):
                                        return data['output']['data'][0]
                                        
                            except json.JSONDecodeError:
                                continue
                
            except Exception as e:
                print(f"Polling attempt {attempt + 1} failed: {e}")
                await asyncio.sleep(0.3)
        
        raise Exception("Polling timeout")
    
    def parse_streaming_result(self, markdown_result):
        """Parse the API result"""
        try:
            import re
            
            real_match = re.search(r'Real Voice.*?(\d+\.\d+)%', markdown_result, re.IGNORECASE)
            fake_match = re.search(r'AI Generated.*?(\d+\.\d+)%', markdown_result, re.IGNORECASE)
            
            real_prob = float(real_match.group(1)) / 100 if real_match else 0.5
            fake_prob = float(fake_match.group(1)) / 100 if fake_match else 0.5
            
            is_fake = fake_prob > real_prob or 'LIKELY AI GENERATED' in markdown_result.upper()
            
            return {
                'prediction': 'FAKE' if is_fake else 'REAL',
                'confidence': max(real_prob, fake_prob),
                'probabilities': {'real': real_prob, 'fake': fake_prob},
                'is_suspicious': fake_prob > 0.3,  # Much more sensitive threshold (30% instead of 50%)
                'raw_result': markdown_result,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"❌ Result parsing error: {e}")
            return {
                'prediction': 'UNKNOWN',
                'confidence': 0.5,
                'error': str(e)
            }
    
    def calculate_rms(self, audio_data):
        """Calculate RMS volume"""
        return np.sqrt(np.mean(audio_data ** 2))
    
    def audio_capture_thread(self):
        """Audio capture thread - collects audio continuously"""
        try:
            audio = pyaudio.PyAudio()
            
            # Find best audio device
            input_device = self.find_best_input_device(audio)
            
            stream = audio.open(
                format=self.FORMAT,
                channels=self.CHANNELS,
                rate=self.RATE,
                input=True,
                input_device_index=input_device,
                frames_per_buffer=self.CHUNK
            )
            
            print(f"🎤 Capturing audio from device {input_device}...")
            
            while self.is_monitoring:
                try:
                    data = stream.read(self.CHUNK, exception_on_overflow=False)
                    audio_np = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                    
                    # Add to streaming buffer
                    with self.buffer_lock:
                        self.streaming_buffer.append(audio_np)
                        self.buffer_duration += len(audio_np) / self.RATE
                        
                        # Keep buffer size manageable (max 10 seconds for maximum context)
                        while self.buffer_duration > 10.0:
                            removed_chunk = self.streaming_buffer.pop(0)
                            self.buffer_duration -= len(removed_chunk) / self.RATE
                    
                except Exception as e:
                    print(f"Audio capture error: {e}")
                    break
                        
        except Exception as e:
            print(f"❌ Audio capture failed: {e}")
            traceback.print_exc()
        finally:
            if 'stream' in locals():
                stream.stop_stream()
                stream.close()
            if 'audio' in locals():
                audio.terminate()
    
    def streaming_analysis_thread(self):
        """Streaming analysis thread - processes audio every 500ms"""
        import asyncio
        
        # Create event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        chunk_count = 0
        
        try:
            while self.is_monitoring:
                time.sleep(self.STREAM_INTERVAL)
                
                if not self.is_monitoring:
                    break
                
                # Get current buffer
                with self.buffer_lock:
                    if len(self.streaming_buffer) == 0 or self.buffer_duration < 4.0:  # Need 4+ seconds of context
                        continue
                        
                    # Copy buffer for processing
                    buffer_copy = list(self.streaming_buffer)
                    duration = self.buffer_duration
                
                # Calculate volume
                combined_audio = np.concatenate(buffer_copy)
                volume = self.calculate_rms(combined_audio)
                
                # Skip if too quiet (but be very sensitive)
                if volume < self.MIN_VOLUME_THRESHOLD:
                    print(f"🔇 Audio too quiet ({volume:.6f}), skipping...")
                    continue
                
                chunk_count += 1
                print(f"\n🎵 Processing LARGE stream chunk #{chunk_count} ({duration:.1f}s, volume: {volume:.6f})")
                print(f"📊 Buffer size: {len(combined_audio)} samples ({len(combined_audio)/self.RATE:.2f}s of audio)")
                
                # Process larger chunk with more context
                loop.run_until_complete(self.process_streaming_chunk(combined_audio, chunk_count))
                
        except Exception as e:
            print(f"❌ Streaming analysis error: {e}")
            traceback.print_exc()
        finally:
            loop.close()
    
    async def process_streaming_chunk(self, audio_data, chunk_id):
        """Process a streaming audio chunk"""
        start_time = time.time()
        
        try:
            # Create larger WAV blob with more audio context
            wav_blob = self.create_wav_blob(audio_data, self.RATE)
            audio_duration = len(audio_data) / self.RATE
            print(f"📦 Analyzing LARGE stream #{chunk_id}: {len(wav_blob)} bytes ({audio_duration:.1f}s audio)")
            
            # Send to API with larger chunk
            result = await self.send_to_streaming_api(wav_blob)
            
            if result and not result.get('error'):
                latency = int((time.time() - start_time) * 1000)
                self.detection_latency.append(latency)
                
                prediction = result.get('prediction', 'UNKNOWN')
                confidence = result.get('confidence', 0)
                
                print(f"🎯 LARGE stream result #{chunk_id}: {prediction} ({confidence:.3f}) - {latency}ms - {audio_duration:.1f}s processed")
                
                result['chunk_id'] = chunk_id
                result['latency'] = latency
                result['audio_duration'] = audio_duration
                result['source'] = 'Desktop Stream (Large Chunks)'
                
                self.handle_streaming_result(result)
            else:
                print(f"❌ Large stream API error #{chunk_id}: {result.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"❌ Large stream processing failed #{chunk_id}: {e}")
    
    def handle_streaming_result(self, result):
        """Handle streaming detection result with smart alert management"""
        self.total_detections += 1
        
        # Add to history
        self.detection_history.append(result)
        if len(self.detection_history) > 100:
            self.detection_history.pop(0)
        
        is_suspicious = result.get('is_suspicious', False)
        confidence = result.get('confidence', 0)
        chunk_id = result.get('chunk_id', 'N/A')
        
        current_time = time.time()
        
        if is_suspicious:
            print(f"🚨 SUSPICIOUS: Chunk #{chunk_id} - Confidence: {confidence:.3f}")
            
            # Smart alert logic - only alert once per detection event
            if not self.in_detection_event:
                # Start of new detection event
                self.in_detection_event = True
                self.detection_event_start = current_time
                self.consecutive_detections = 1
                
                # Show alert for new detection event
                if self.should_show_alert():
                    print(f"🔥 NEW DEEPFAKE EVENT DETECTED! Starting alert sequence...")
                    self.trigger_streaming_alert(result)
                    self.last_alert_time = current_time
                
            else:
                # Continuing detection event
                self.consecutive_detections += 1
                print(f"📊 Continuing detection event: {self.consecutive_detections} consecutive chunks")
        else:
            # Not suspicious - check if we should end detection event
            if self.in_detection_event:
                # End detection event after clean result
                detection_duration = current_time - self.detection_event_start
                print(f"✅ Detection event ended. Duration: {detection_duration:.1f}s, Total chunks: {self.consecutive_detections}")
                
                self.in_detection_event = False
                self.consecutive_detections = 0
                self.detection_event_start = 0
        
        # Log all detections (both suspicious and clean)
        if self.log_detections:
            status = "SUSPICIOUS" if is_suspicious else "CLEAN"
            logging.info(f"Stream Detection: {result.get('prediction')} - {status} (confidence: {confidence:.3f}) - Chunk #{chunk_id}")
    
    def should_show_alert(self):
        """Check if we should show an alert (prevents spam)"""
        return time.time() - self.last_alert_time >= self.alert_cooldown
    
    def trigger_streaming_alert(self, result):
        """Trigger alert for streaming detection"""
        confidence = result.get('confidence', 0)
        chunk_id = result.get('chunk_id', 'N/A')
        latency = result.get('latency', 'N/A')
        
        alert_message = f"🚨 REAL-TIME DEEPFAKE DETECTED!\nChunk: #{chunk_id}\nConfidence: {confidence:.1%}\nLatency: {latency}ms\nTime: {datetime.now().strftime('%H:%M:%S')}"
        
        print("=" * 60)
        print("🚨 DEEPFAKE EVENT ALERT! 🚨")
        print(f"Chunk: #{chunk_id}")
        print(f"Confidence: {confidence:.1%}")
        print(f"Detection Time: {latency}ms")
        print(f"Time: {datetime.now().strftime('%H:%M:%S')}")
        print("=" * 60)
        
        # NO SOUND ALERTS - commented out to prevent annoyance
        # Sound alerts are disabled to prevent spam
        
        # System notification
        if self.tray_icon:
            try:
                def send_notification():
                    try:
                        self.tray_icon.notify(
                            title="🦁 Lion - AI Detection Event",
                            message=f"Deepfake audio detected: {confidence:.1%} confidence"
                        )
                    except Exception as e:
                        print(f"Notification failed: {e}")
                
                threading.Thread(target=send_notification, daemon=True).start()
            except:
                pass
        
        # Windows toast (silent)
        try:
            self.show_windows_toast(confidence, chunk_id, latency)
        except Exception as e:
            print(f"Toast notification failed: {e}")
        
        # Popup alert (reduced frequency)
        if self.alert_popup:
            try:
                self.show_thread_safe_popup(confidence, chunk_id, latency)
            except Exception as e:
                print(f"Popup failed: {e}")
        
        # Log alert
        logging.warning(f"DEEPFAKE EVENT: Chunk #{chunk_id}, Confidence {confidence:.3f}, Latency {latency}ms")
    
    def show_windows_toast(self, confidence, chunk_id, latency):
        """Show Windows toast notification"""
        try:
            from plyer import notification
            
            notification.notify(
                title="🦁 Lion - Deepfake Event Detected",
                message=f"AI voice event detected with {confidence:.1%} confidence",
                app_name="Lion - AI Detection",
                timeout=5  # Shorter timeout
            )
        except Exception as e:
            print(f"Toast notification error: {e}")
    
    def show_thread_safe_popup(self, confidence, chunk_id, latency):
        """Show thread-safe popup"""
        def show_popup():
            try:
                popup_root = tk.Tk()
                popup_root.withdraw()
                
                messagebox.showwarning(
                    "🦁 Lion - AI Detection Event!",
                    f"Deepfake audio event detected!\n\nConfidence: {confidence:.1%}\nTime: {datetime.now().strftime('%H:%M:%S')}\n\nMultiple chunks detected - this appears to be AI-generated audio."
                )
                
                popup_root.destroy()
            except Exception as e:
                print(f"Popup error: {e}")
        
        threading.Thread(target=show_popup, daemon=True).start()
    
    def find_best_input_device(self, audio):
        """Find the best audio input device for system audio"""
        device_count = audio.get_device_count()
        
        print("🔍 Available audio devices:")
        for i in range(device_count):
            info = audio.get_device_info_by_index(i)
            if info['maxInputChannels'] > 0:
                print(f"  {i}: {info['name']} (inputs: {info['maxInputChannels']})")
        
        # Look for system audio or stereo mix first
        for i in range(device_count):
            info = audio.get_device_info_by_index(i)
            if info['maxInputChannels'] > 0:
                name = info['name'].lower()
                if any(keyword in name for keyword in ['stereo mix', 'what u hear', 'system audio', 'loopback']):
                    print(f"📻 Using system audio device: {info['name']}")
                    return i
        
        # Fallback to default microphone
        try:
            default_device = audio.get_default_input_device_info()
            print(f"🎤 Using default microphone: {default_device['name']}")
            print("⚠️ Note: For system audio capture, enable 'Stereo Mix' in Windows Sound settings")
            return default_device['index']
        except:
            print("🎤 Using device 0 as fallback")
            return 0
    
    def create_system_tray(self):
        """Create system tray icon"""
        icon_image = None
        
        # For PyInstaller executables, check if we're bundled
        if getattr(sys, 'frozen', False):
            # Running as compiled executable
            bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
            icon_paths = [
                os.path.join(bundle_dir, 'lion_icon.png'),
                os.path.join(bundle_dir, 'lion_icon.ico'),
                os.path.join(bundle_dir, 'icon.png')
            ]
            print(f"🔍 Looking for bundled icons in: {bundle_dir}")
        else:
            # Running as Python script
            icon_paths = ['lion_icon.png', 'lion_icon.ico', 'icon.png', 'logo.png']
            print("🔍 Looking for icons in current directory")
        
        # Try to load icon file
        for icon_file in icon_paths:
            try:
                if os.path.exists(icon_file):
                    icon_image = Image.open(icon_file).convert('RGBA')
                    icon_image = icon_image.resize((64, 64), Image.Resampling.LANCZOS)
                    print(f"🦁 Using icon: {icon_file}")
                    break
            except Exception as e:
                print(f"⚠️ Could not load {icon_file}: {e}")
        
        # Fallback: Create a Lion-themed icon programmatically
        if icon_image is None:
            try:
                from PIL import ImageDraw, ImageFont
                print("🎨 Creating programmatic Lion icon...")
                
                # Create gradient background (gold to red)
                icon_image = Image.new('RGB', (64, 64), color='#FFD700')  # Gold background
                draw = ImageDraw.Draw(icon_image)
                
                # Draw a red border
                draw.rectangle([0, 0, 63, 63], outline='#FF0000', width=3)
                
                # Draw "L" for Lion
                try:
                    # Try to use a system font
                    font = ImageFont.truetype("arial.ttf", 36)
                except:
                    try:
                        font = ImageFont.load_default()
                    except:
                        font = None
                
                if font:
                    text = "L"  # Simple "L" for Lion
                    try:
                        bbox = draw.textbbox((0, 0), text, font=font)
                        text_width = bbox[2] - bbox[0]
                        text_height = bbox[3] - bbox[1]
                        x = (64 - text_width) // 2
                        y = (64 - text_height) // 2
                        draw.text((x, y), text, fill='#000000', font=font)
                    except:
                        # Even simpler fallback
                        draw.text((25, 15), text, fill='#000000')
                
                print("✅ Created programmatic Lion icon")
                
            except Exception as e:
                print(f"⚠️ Icon creation failed: {e}")
                # Ultimate fallback: simple colored square
                icon_image = Image.new('RGB', (64, 64), color='#FFD700')
                print("🟡 Using simple gold square icon")
        
        menu = Menu(
            MenuItem("🎤 Start Real-Time Monitoring", self.start_monitoring, 
                    enabled=lambda item: not self.is_monitoring),
            MenuItem("⏹️ Stop Monitoring", self.stop_monitoring, 
                    enabled=lambda item: self.is_monitoring),
            Menu.SEPARATOR,
            MenuItem("❓ Audio Setup Help", self.show_system_audio_help),
            MenuItem("🔄 Start with Windows", self.toggle_auto_start,
                    checked=lambda item: self.auto_start_enabled),
            Menu.SEPARATOR,
            MenuItem("🧪 Test Alert System", self.test_alert),
            MenuItem("📊 Show Statistics", self.show_statistics),
            MenuItem("⚙️ Settings", self.show_settings),
            MenuItem("📁 Open Log File", self.open_log_file),
            Menu.SEPARATOR,
            MenuItem("❌ Exit", self.quit_application)
        )
        
        self.tray_icon = pystray.Icon("lion_ai_detector", icon_image, "Lion - AI Detection", menu)
    
    def start_monitoring(self, icon=None, item=None):
        """Start real-time streaming monitoring"""
        if not self.is_monitoring:
            self.is_monitoring = True
            
            # Start audio capture thread
            capture_thread = threading.Thread(target=self.audio_capture_thread, daemon=True)
            capture_thread.start()
            
            # Start streaming analysis thread
            analysis_thread = threading.Thread(target=self.streaming_analysis_thread, daemon=True)
            analysis_thread.start()
            
            print("🚀 Real-time deepfake monitoring started!")
            print(f"🎯 Alert threshold: {self.alert_threshold}")
            print(f"⚡ Streaming interval: {self.STREAM_INTERVAL}s")
            
            if self.tray_icon:
                try:
                    self.tray_icon.notify(
                        "🦁 Lion - OPTIMIZED Monitoring Started!",
                        f"HIGH SENSITIVITY detection active (threshold: {self.alert_threshold})"
                    )
                except:
                    pass
    
    def stop_monitoring(self, icon=None, item=None):
        """Stop monitoring"""
        if self.is_monitoring:
            self.is_monitoring = False
            
            # Clear detection state
            with self.buffer_lock:
                self.streaming_buffer.clear()
                self.buffer_duration = 0.0
            
            # Reset detection event state
            self.in_detection_event = False
            self.consecutive_detections = 0
            self.detection_event_start = 0
            
            print("⏹️ Real-time monitoring stopped!")
            
            # Show final statistics
            if self.detection_latency:
                avg_latency = sum(self.detection_latency) / len(self.detection_latency)
                print(f"📊 Session stats: {self.total_detections} detections, avg latency: {avg_latency:.0f}ms")
            
            if self.tray_icon:
                try:
                    self.tray_icon.notify("🦁 Lion - Monitoring Stopped", "AI detection paused")
                except:
                    pass
    
    def test_alert(self, icon=None, item=None):
        """Test the alert system"""
        print("🧪 Testing real-time alert system...")
        
        test_result = {
            'prediction': 'FAKE',
            'confidence': 0.95,
            'chunk_id': 999,
            'latency': 850,
            'is_suspicious': True
        }
        
        self.trigger_streaming_alert(test_result)
    
    def show_statistics(self, icon=None, item=None):
        """Show detection statistics"""
        if self.detection_latency:
            avg_latency = sum(self.detection_latency) / len(self.detection_latency)
            min_latency = min(self.detection_latency)
            max_latency = max(self.detection_latency)
        else:
            avg_latency = min_latency = max_latency = 0
        
        stats = f"""
Real-Time Detection Statistics:
- Total Detections: {self.total_detections}
- Recent Detections: {len(self.detection_history)}
- Average Latency: {avg_latency:.0f}ms
- Min/Max Latency: {min_latency}/{max_latency}ms
- Monitoring: {self.is_monitoring}
- Alert Threshold: {self.alert_threshold}
        """
        
        print(stats)
        
        if self.tray_icon:
            try:
                self.tray_icon.notify(
                    "Statistics",
                    f"Detections: {self.total_detections}, Avg Latency: {avg_latency:.0f}ms"
                )
            except:
                pass
    
    def show_settings(self, icon=None, item=None):
        """Show current settings"""
        settings = f"""
Current Settings:
- Alert Threshold: {self.alert_threshold}
- Stream Interval: {self.STREAM_INTERVAL}s
- Alert Sound: {self.alert_sound}
- Alert Popup: {self.alert_popup}
- Log Detections: {self.log_detections}
- Sample Rate: {self.RATE}Hz
        """
        
        print(settings)
        
        if self.tray_icon:
            try:
                self.tray_icon.notify("Settings", f"Threshold: {self.alert_threshold}, Interval: {self.STREAM_INTERVAL}s")
            except:
                pass
    
    def open_log_file(self, icon=None, item=None):
        """Open the detection log file"""
        try:
            log_file = Path("logs/deepfake_detections.log")
            if log_file.exists():
                os.startfile(str(log_file))
            else:
                print("📁 No log file found yet")
                if self.tray_icon:
                    try:
                        self.tray_icon.notify("No Log File", "No detections logged yet")
                    except:
                        pass
        except Exception as e:
            print(f"Error opening log file: {e}")
    
    def quit_application(self, icon=None, item=None):
        """Quit the application"""
        print("👋 Shutting down real-time monitor...")
        self.stop_monitoring()
        
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except:
                pass
        
        os._exit(0)
    
    def run(self):
        """Run the application"""
        print("🚀 Starting Lion - AI Detection (Desktop Monitor)")
        print(f"🎯 Alert threshold: {self.alert_threshold}")
        print(f"⚡ Streaming interval: {self.STREAM_INTERVAL}s")
        print(f"🌐 API endpoint: {self.HF_API_URL}")
        print("📋 Right-click system tray icon to start monitoring")
        
        # Show first-time setup for new users
        self.show_first_time_setup()
        
        # Create and run system tray
        self.create_system_tray()
        
        # Show startup notification
        if self.tray_icon:
            try:
                def delayed_notification():
                    time.sleep(2)  # Wait for tray to be ready
                    try:
                        self.tray_icon.notify(
                            "🦁 Lion AI Detection Started", 
                            "Right-click the tray icon to begin monitoring"
                        )
                    except Exception as e:
                        print(f"Startup notification failed: {e}")
                
                threading.Thread(target=delayed_notification, daemon=True).start()
            except:
                pass
        
        try:
            self.tray_icon.run()
        except Exception as e:
            print(f"System tray error: {e}")
            self.console_mode()
    
    def console_mode(self):
        """Fallback console mode"""
        print("\n📟 Console Mode - Lion AI Detection")
        print("Commands: start, stop, test, stats, settings, quit")
        
        while True:
            try:
                cmd = input("\n> ").lower().strip()
                
                if cmd == "start":
                    self.start_monitoring()
                elif cmd == "stop":
                    self.stop_monitoring()
                elif cmd == "test":
                    self.test_alert()
                elif cmd == "stats":
                    self.show_statistics()
                elif cmd == "settings":
                    self.show_settings()
                elif cmd in ["quit", "exit", "q"]:
                    break
                elif cmd == "status":
                    print(f"Monitoring: {self.is_monitoring}")
                    print(f"Detections: {len(self.detection_history)}")
                    print(f"Total processed: {self.total_detections}")
                elif cmd == "help":
                    self.show_system_audio_help()
                else:
                    print("Commands: start, stop, test, stats, settings, help, status, quit")
                    
            except KeyboardInterrupt:
                break
        
        self.quit_application()

def main():
    """Main entry point"""
    try:
        monitor = StreamingDeepfakeMonitor()
        monitor.run()
    except KeyboardInterrupt:
        print("\n⏹️ Application interrupted")
    except Exception as e:
        print(f"❌ Application error: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    main()