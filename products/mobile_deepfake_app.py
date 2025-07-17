# Mobile Deepfake Detection App
# Cross-platform mobile app using Kivy/KivyMD

from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.progressbar import ProgressBar
from kivy.uix.popup import Popup
from kivy.uix.filechooser import FileChooserIconView
from kivy.uix.switch import Switch
from kivy.uix.slider import Slider
from kivy.uix.scrollview import ScrollView
from kivy.clock import Clock
from kivy.logger import Logger
from kivy.utils import platform

from kivymd.app import MDApp
from kivymd.uix.screen import MDScreen
from kivymd.uix.button import MDRaisedButton, MDIconButton, MDFloatingActionButton
from kivymd.uix.label import MDLabel
from kivymd.uix.card import MDCard
from kivymd.uix.boxlayout import MDBoxLayout
from kivymd.uix.toolbar import MDTopAppBar
from kivymd.uix.navigationdrawer import MDNavigationDrawer, MDNavigationDrawerMenu
from kivymd.uix.dialog import MDDialog
from kivymd.uix.slider import MDSlider
from kivymd.uix.switch import MDSwitch

import torch
import librosa
import soundfile as sf
import numpy as np
import threading
import queue
import json
from datetime import datetime
from pathlib import Path
import tempfile
import os

# Import detection model
from deepfake_detector import DeepfakeDetectorCNN, AudioFeatureExtractor

# Handle platform-specific audio recording
if platform == 'android':
    from android.permissions import request_permissions, Permission
    from android.storage import primary_external_storage_path
    from plyer import audio
else:
    import pyaudio
    import wave

class DeepfakeDetectionScreen(MDScreen):
    """Main screen for deepfake detection"""
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.app = None
        self.build_ui()
    
    def build_ui(self):
        """Build the main UI"""
        # Main layout
        main_layout = MDBoxLayout(orientation='vertical', spacing=10, padding=20)
        
        # Top app bar
        toolbar = MDTopAppBar(
            title="🎤 Deepfake Detector",
            elevation=3,
            left_action_items=[["menu", lambda x: self.open_nav_drawer()]]
        )
        main_layout.add_widget(toolbar)
        
        # Status card
        self.status_card = MDCard(
            MDBoxLayout(
                MDLabel(
                    text="📱 Ready to Detect",
                    theme_text_color="Primary",
                    size_hint_y=None,
                    height=60,
                    halign="center"
                ),
                orientation='vertical',
                padding=20
            ),
            size_hint_y=None,
            height=100,
            elevation=2,
            radius=[10],
            md_bg_color=[0.2, 0.7, 0.3, 1]  # Green
        )
        main_layout.add_widget(self.status_card)
        
        # Control buttons
        button_layout = MDBoxLayout(orientation='horizontal', spacing=20, size_hint_y=None, height=60)
        
        self.record_btn = MDRaisedButton(
            text="🎙️ Record Audio",
            on_release=self.start_recording,
            md_bg_color=[0.2, 0.6, 1, 1]
        )
        button_layout.add_widget(self.record_btn)
        
        self.file_btn = MDRaisedButton(
            text="📁 Upload File",
            on_release=self.choose_file,
            md_bg_color=[0.8, 0.4, 0.1, 1]
        )
        button_layout.add_widget(self.file_btn)
        
        main_layout.add_widget(button_layout)
        
        # Real-time monitoring toggle
        monitor_layout = MDBoxLayout(orientation='horizontal', spacing=20, size_hint_y=None, height=60)
        
        monitor_layout.add_widget(MDLabel(text="🔄 Real-time Monitoring:", size_hint_x=0.7))
        
        self.monitor_switch = MDSwitch()
        self.monitor_switch.bind(active=self.toggle_monitoring)
        monitor_layout.add_widget(self.monitor_switch)
        
        main_layout.add_widget(monitor_layout)
        
        # Sensitivity slider
        sensitivity_layout = MDBoxLayout(orientation='vertical', spacing=10, size_hint_y=None, height=100)
        
        sensitivity_layout.add_widget(MDLabel(text="🎯 Detection Sensitivity:", size_hint_y=None, height=30))
        
        self.sensitivity_slider = MDSlider(
            min=0.5,
            max=0.95,
            value=0.75,
            size_hint_y=None,
            height=40
        )
        sensitivity_layout.add_widget(self.sensitivity_slider)
        
        main_layout.add_widget(sensitivity_layout)
        
        # Progress bar
        self.progress = ProgressBar(max=100, size_hint_y=None, height=20)
        main_layout.add_widget(self.progress)
        
        # Results area
        results_label = MDLabel(text="📊 Detection Results:", size_hint_y=None, height=40)
        main_layout.add_widget(results_label)
        
        # Scrollable results
        scroll = ScrollView()
        self.results_layout = MDBoxLayout(orientation='vertical', spacing=10, adaptive_height=True)
        scroll.add_widget(self.results_layout)
        main_layout.add_widget(scroll)
        
        self.add_widget(main_layout)
    
    def start_recording(self, *args):
        """Start audio recording"""
        if self.app:
            self.app.start_audio_recording()
    
    def choose_file(self, *args):
        """Open file chooser"""
        if self.app:
            self.app.open_file_chooser()
    
    def toggle_monitoring(self, instance, value):
        """Toggle real-time monitoring"""
        if self.app:
            if value:
                self.app.start_real_time_monitoring()
            else:
                self.app.stop_real_time_monitoring()
    
    def update_status(self, text, color):
        """Update status display"""
        self.status_card.children[0].children[0].text = text
        self.status_card.md_bg_color = color
    
    def add_result(self, result):
        """Add detection result to display"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        confidence = result.get('confidence', 0) * 100
        prediction = result.get('prediction', 'UNKNOWN')
        
        color = [1, 0.3, 0.3, 1] if prediction == 'FAKE' else [0.3, 1, 0.3, 1]
        
        result_card = MDCard(
            MDBoxLayout(
                MDLabel(
                    text=f"⏰ {timestamp}\n🎯 {prediction}\n📊 {confidence:.1f}% confidence",
                    theme_text_color="Primary",
                    size_hint_y=None,
                    height=80
                ),
                orientation='vertical',
                padding=15
            ),
            size_hint_y=None,
            height=100,
            elevation=1,
            radius=[5],
            md_bg_color=color
        )
        
        self.results_layout.add_widget(result_card)
        
        # Keep only last 10 results
        if len(self.results_layout.children) > 10:
            self.results_layout.remove_widget(self.results_layout.children[-1])

class DeepfakeMobileApp(MDApp):
    """Main mobile application"""
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Model components
        self.model = None
        self.feature_extractor = None
        self.device = torch.device('cpu')  # Mobile typically uses CPU
        
        # Audio recording
        self.is_recording = False
        self.is_monitoring = False
        self.audio_queue = queue.Queue()
        
        # Settings
        self.sensitivity = 0.75
        self.detection_history = []
        
        # Load model
        self.load_model()
        
        # Request permissions on Android
        if platform == 'android':
            self.request_android_permissions()
    
    def build(self):
        """Build the app"""
        self.theme_cls.theme_style = "Light"
        self.theme_cls.primary_palette = "Blue"
        
        self.screen = DeepfakeDetectionScreen()
        self.screen.app = self
        
        return self.screen
    
    def load_model(self):
        """Load the trained deepfake detection model"""
        try:
            # Try to load model
            model_path = 'models/best_deepfake_detector.pth'
            if not os.path.exists(model_path):
                Logger.warning(f"Model not found at {model_path}")
                return False
            
            self.model = DeepfakeDetectorCNN()
            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
            self.model.eval()
            
            self.feature_extractor = AudioFeatureExtractor()
            Logger.info("✅ Model loaded successfully for mobile app!")
            return True
            
        except Exception as e:
            Logger.error(f"❌ Error loading model: {e}")
            return False
    
    def request_android_permissions(self):
        """Request necessary permissions on Android"""
        try:
            request_permissions([
                Permission.RECORD_AUDIO,
                Permission.READ_EXTERNAL_STORAGE,
                Permission.WRITE_EXTERNAL_STORAGE
            ])
        except Exception as e:
            Logger.warning(f"Permission request failed: {e}")
    
    def start_audio_recording(self):
        """Start recording audio for analysis"""
        if self.is_recording:
            return
        
        self.is_recording = True
        self.screen.update_status("🔴 Recording...", [1, 0.3, 0.3, 1])
        self.screen.record_btn.text = "⏹️ Stop Recording"
        self.screen.record_btn.on_release = self.stop_recording
        
        # Start recording in background thread
        threading.Thread(target=self._record_audio_thread, daemon=True).start()
    
    def stop_recording(self):
        """Stop recording and analyze audio"""
        if not self.is_recording:
            return
        
        self.is_recording = False
        self.screen.update_status("🔄 Analyzing...", [1, 1, 0.3, 1])
        self.screen.record_btn.text = "🎙️ Record Audio"
        self.screen.record_btn.on_release = self.start_audio_recording
    
    def _record_audio_thread(self):
        """Background thread for audio recording"""
        try:
            if platform == 'android':
                self._record_audio_android()
            else:
                self._record_audio_desktop()
        except Exception as e:
            Logger.error(f"Recording error: {e}")
            Clock.schedule_once(lambda dt: self._recording_error(str(e)), 0)
    
    def _record_audio_android(self):
        """Record audio on Android using plyer"""
        try:
            from plyer import audio
            
            # Record for 5 seconds
            audio_path = "/storage/emulated/0/temp_recording.wav"
            audio.record(audio_path, duration=5)
            
            # Wait for recording to complete
            import time
            time.sleep(5.5)
            
            # Analyze the recorded file
            Clock.schedule_once(lambda dt: self._analyze_file(audio_path), 0)
            
        except Exception as e:
            Logger.error(f"Android recording error: {e}")
            Clock.schedule_once(lambda dt: self._recording_error(str(e)), 0)
    
    def _record_audio_desktop(self):
        """Record audio on desktop using pyaudio"""
        try:
            import pyaudio
            import wave
            
            FORMAT = pyaudio.paInt16
            CHANNELS = 1
            RATE = 22050
            CHUNK = 1024
            RECORD_SECONDS = 5
            
            audio = pyaudio.PyAudio()
            
            stream = audio.open(format=FORMAT,
                              channels=CHANNELS,
                              rate=RATE,
                              input=True,
                              frames_per_buffer=CHUNK)
            
            frames = []
            for _ in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
                if not self.is_recording:
                    break
                data = stream.read(CHUNK)
                frames.append(data)
            
            stream.stop_stream()
            stream.close()
            audio.terminate()
            
            # Save recording
            temp_path = tempfile.mktemp(suffix='.wav')
            wf = wave.open(temp_path, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(audio.get_sample_size(FORMAT))
            wf.setframerate(RATE)
            wf.writeframes(b''.join(frames))
            wf.close()
            
            # Analyze the recorded file
            Clock.schedule_once(lambda dt: self._analyze_file(temp_path), 0)
            
        except Exception as e:
            Logger.error(f"Desktop recording error: {e}")
            Clock.schedule_once(lambda dt: self._recording_error(str(e)), 0)
    
    def _analyze_file(self, file_path):
        """Analyze audio file for deepfake detection"""
        try:
            if not self.model:
                self._show_error("Model not loaded")
                return
            
            # Update progress
            self.screen.progress.value = 25
            
            # Extract features
            features = self.feature_extractor.extract_mel_spectrogram(file_path)
            self.screen.progress.value = 50
            
            if features is None:
                self._show_error("Failed to extract audio features")
                return
            
            # Predict
            features_tensor = torch.FloatTensor(features).unsqueeze(0).unsqueeze(0)
            
            with torch.no_grad():
                outputs = self.model(features_tensor)
                probabilities = torch.softmax(outputs, dim=1)
                fake_prob = probabilities[0][1].item()
                real_prob = probabilities[0][0].item()
            
            self.screen.progress.value = 100
            
            # Create result
            result = {
                'timestamp': datetime.now().isoformat(),
                'prediction': 'FAKE' if fake_prob > 0.5 else 'REAL',
                'confidence': max(fake_prob, real_prob),
                'fake_probability': fake_prob,
                'real_probability': real_prob
            }
            
            # Store result
            self.detection_history.append(result)
            
            # Update UI
            self._show_result(result)
            
            # Clean up temp file
            if file_path.startswith('/tmp') or 'temp' in file_path:
                try:
                    os.remove(file_path)
                except:
                    pass
            
        except Exception as e:
            Logger.error(f"Analysis error: {e}")
            self._show_error(f"Analysis failed: {str(e)}")
        finally:
            self.screen.progress.value = 0
            self.screen.update_status("📱 Ready to Detect", [0.2, 0.7, 0.3, 1])
    
    def _show_result(self, result):
        """Show detection result"""
        self.screen.add_result(result)
        
        # Show alert for fake detection
        if result['prediction'] == 'FAKE' and result['confidence'] > self.sensitivity:
            self._show_deepfake_alert(result)
    
    def _show_deepfake_alert(self, result):
        """Show deepfake detection alert"""
        confidence = result['confidence'] * 100
        
        dialog = MDDialog(
            title="🚨 Deepfake Detected!",
            text=f"AI-generated voice detected with {confidence:.1f}% confidence.\n\nThis audio may not be authentic.",
            buttons=[
                MDRaisedButton(
                    text="OK",
                    on_release=lambda x: dialog.dismiss()
                )
            ]
        )
        dialog.open()
        
        # Try to vibrate (Android)
        if platform == 'android':
            try:
                from plyer import vibrator
                vibrator.vibrate(1)  # 1 second vibration
            except:
                pass
    
    def _show_error(self, message):
        """Show error message"""
        dialog = MDDialog(
            title="❌ Error",
            text=message,
            buttons=[
                MDRaisedButton(
                    text="OK",
                    on_release=lambda x: dialog.dismiss()
                )
            ]
        )
        dialog.open()
        
        self.screen.update_status("❌ Error", [1, 0.3, 0.3, 1])
    
    def _recording_error(self, error_msg):
        """Handle recording error"""
        self.is_recording = False
        self.screen.record_btn.text = "🎙️ Record Audio"
        self.screen.record_btn.on_release = self.start_audio_recording
        self._show_error(f"Recording failed: {error_msg}")
    
    def open_file_chooser(self):
        """Open file chooser for audio file selection"""
        try:
            # Create file chooser popup
            content = BoxLayout(orientation='vertical')
            
            if platform == 'android':
                # On Android, use simple path
                initial_path = "/storage/emulated/0/"
            else:
                # On desktop, use home directory
                initial_path = str(Path.home())
            
            filechooser = FileChooserIconView(
                path=initial_path,
                filters=['*.wav', '*.mp3', '*.m4a', '*.flac']
            )
            content.add_widget(filechooser)
            
            button_layout = BoxLayout(orientation='horizontal', size_hint_y=None, height=50)
            
            select_btn = Button(text="Select", size_hint_x=0.5)
            cancel_btn = Button(text="Cancel", size_hint_x=0.5)
            
            button_layout.add_widget(select_btn)
            button_layout.add_widget(cancel_btn)
            content.add_widget(button_layout)
            
            popup = Popup(
                title="Select Audio File",
                content=content,
                size_hint=(0.9, 0.9)
            )
            
            def select_file(*args):
                if filechooser.selection:
                    selected_file = filechooser.selection[0]
                    popup.dismiss()
                    self._analyze_file(selected_file)
            
            def cancel_selection(*args):
                popup.dismiss()
            
            select_btn.bind(on_release=select_file)
            cancel_btn.bind(on_release=cancel_selection)
            
            popup.open()
            
        except Exception as e:
            Logger.error(f"File chooser error: {e}")
            self._show_error(f"File selection failed: {str(e)}")
    
    def start_real_time_monitoring(self):
        """Start real-time audio monitoring"""
        if self.is_monitoring:
            return
        
        self.is_monitoring = True
        self.screen.update_status("🔄 Monitoring...", [0.3, 0.3, 1, 1])
        
        # Start monitoring thread
        threading.Thread(target=self._monitoring_thread, daemon=True).start()
    
    def stop_real_time_monitoring(self):
        """Stop real-time monitoring"""
        self.is_monitoring = False
        self.screen.update_status("📱 Ready to Detect", [0.2, 0.7, 0.3, 1])
    
    def _monitoring_thread(self):
        """Background thread for real-time monitoring"""
        try:
            if platform == 'android':
                self._monitor_android()
            else:
                self._monitor_desktop()
        except Exception as e:
            Logger.error(f"Monitoring error: {e}")
            Clock.schedule_once(lambda dt: self.stop_real_time_monitoring(), 0)
    
    def _monitor_android(self):
        """Real-time monitoring on Android"""
        # Note: Real-time monitoring on Android is limited
        # This is a simplified version
        import time
        
        while self.is_monitoring:
            try:
                # Record short clips for analysis
                temp_path = "/storage/emulated/0/temp_monitor.wav"
                
                from plyer import audio
                audio.record(temp_path, duration=3)
                time.sleep(3.5)
                
                if os.path.exists(temp_path):
                    Clock.schedule_once(lambda dt: self._analyze_file(temp_path), 0)
                
                time.sleep(2)  # Wait before next recording
                
            except Exception as e:
                Logger.error(f"Android monitoring error: {e}")
                break
    
    def _monitor_desktop(self):
        """Real-time monitoring on desktop"""
        try:
            import pyaudio
            
            FORMAT = pyaudio.paInt16
            CHANNELS = 1
            RATE = 22050
            CHUNK = 1024
            RECORD_SECONDS = 3
            
            audio = pyaudio.PyAudio()
            
            stream = audio.open(format=FORMAT,
                              channels=CHANNELS,
                              rate=RATE,
                              input=True,
                              frames_per_buffer=CHUNK)
            
            while self.is_monitoring:
                try:
                    # Collect audio frames
                    frames = []
                    for _ in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
                        if not self.is_monitoring:
                            break
                        data = stream.read(CHUNK, exception_on_overflow=False)
                        frames.append(data)
                    
                    if frames and self.is_monitoring:
                        # Create temporary file
                        temp_path = tempfile.mktemp(suffix='.wav')
                        
                        wf = wave.open(temp_path, 'wb')
                        wf.setnchannels(CHANNELS)
                        wf.setsampwidth(audio.get_sample_size(FORMAT))
                        wf.setframerate(RATE)
                        wf.writeframes(b''.join(frames))
                        wf.close()
                        
                        # Analyze in main thread
                        Clock.schedule_once(lambda dt: self._analyze_file(temp_path), 0)
                    
                    time.sleep(1)  # Small delay between analyses
                    
                except Exception as e:
                    Logger.error(f"Desktop monitoring chunk error: {e}")
                    continue
            
            stream.stop_stream()
            stream.close()
            audio.terminate()
            
        except Exception as e:
            Logger.error(f"Desktop monitoring error: {e}")

# Build script for creating APK (save as buildozer.spec)
BUILDOZER_SPEC = '''
[app]
title = Deepfake Detector
package.name = deepfakedetector
package.domain = com.yourname.deepfakedetector

source.dir = .
source.include_exts = py,png,jpg,kv,atlas,json,pth

version = 1.0
requirements = python3,kivy,kivymd,torch,librosa,soundfile,numpy,plyer

[buildozer]
log_level = 2

[android]
permissions = RECORD_AUDIO,READ_EXTERNAL_STORAGE,WRITE_EXTERNAL_STORAGE,VIBRATE
'''

def create_mobile_build_files():
    """Create files needed for mobile app building"""
    
    # Create buildozer.spec for Android APK building
    with open("buildozer.spec", "w") as f:
        f.write(BUILDOZER_SPEC)
    
    print("✅ Mobile app build files created!")
    print("\n📱 Android APK Building Instructions:")
    print("1. Install buildozer: pip install buildozer")
    print("2. Install Android SDK and NDK")
    print("3. Run: buildozer android debug")
    print("4. APK will be created in bin/ folder")
    
    print("\n🍎 iOS Building Instructions:")
    print("1. Install kivy-ios: pip install kivy-ios")
    print("2. Run: toolchain build python3 kivy")
    print("3. Create Xcode project: toolchain create <YourApp> .")
    print("4. Open in Xcode and build")

def main():
    """Main function to run the mobile app"""
    
    # Create build files
    create_mobile_build_files()
    
    # Run the app
    try:
        app = DeepfakeMobileApp()
        app.run()
    except Exception as e:
        print(f"❌ App startup error: {e}")
        print("Make sure all dependencies are installed:")
        print("pip install kivy kivymd torch librosa soundfile numpy plyer")

if __name__ == "__main__":
    main()