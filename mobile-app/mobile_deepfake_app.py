# mobile_deepfake_app.py - Mobile app using HuggingFace API
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.progressbar import ProgressBar
from kivy.uix.popup import Popup
from kivy.uix.filechooser import FileChooserIconView
from kivy.uix.scrollview import ScrollView
from kivy.clock import Clock
from kivy.logger import Logger
from kivy.utils import platform

from kivymd.app import MDApp
from kivymd.uix.screen import MDScreen
from kivymd.uix.button import MDRaisedButton
from kivymd.uix.label import MDLabel
from kivymd.uix.card import MDCard
from kivymd.uix.boxlayout import MDBoxLayout
from kivymd.uix.toolbar import MDTopAppBar
from kivymd.uix.dialog import MDDialog

import threading
import tempfile
import os
from datetime import datetime
from pathlib import Path

# Import our HuggingFace API client
from hf_api_client import HuggingFaceDeepfakeAPI

# Handle platform-specific audio recording
if platform == 'android':
    from android.permissions import request_permissions, Permission
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
        main_layout = MDBoxLayout(orientation='vertical', spacing=10, padding=20)
        
        # Top app bar
        toolbar = MDTopAppBar(
            title="🎤 AI Voice Detector",
            elevation=3
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
    """Main mobile application using HuggingFace API"""
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Use HuggingFace API instead of local model
        self.api_client = HuggingFaceDeepfakeAPI()
        
        # Audio recording
        self.is_recording = False
        
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
    
    def request_android_permissions(self):
        """Request necessary permissions on Android"""
        try:
            request_permissions([
                Permission.RECORD_AUDIO,
                Permission.READ_EXTERNAL_STORAGE,
                Permission.WRITE_EXTERNAL_STORAGE,
                Permission.INTERNET
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
        """Stop recording"""
        self.is_recording = False
        self.screen.record_btn.text = "🎙️ Record Audio"
        self.screen.record_btn.on_release = self.start_audio_recording
    
    def _record_audio_thread(self):
        """Background thread for audio recording"""
        try:
            if platform == 'android':
                audio_file = self._record_audio_android()
            else:
                audio_file = self._record_audio_desktop()
                
            if audio_file:
                Clock.schedule_once(lambda dt: self._analyze_with_hf_api(audio_file), 0)
            else:
                Clock.schedule_once(lambda dt: self._recording_error("Recording failed"), 0)
                
        except Exception as e:
            Logger.error(f"Recording error: {e}")
            Clock.schedule_once(lambda dt: self._recording_error(str(e)), 0)
    
    def _record_audio_android(self):
        """Record audio on Android"""
        try:
            audio_path = "/storage/emulated/0/temp_recording.wav"
            audio.record(audio_path, duration=5)
            
            import time
            time.sleep(5.5)
            
            return audio_path if os.path.exists(audio_path) else None
            
        except Exception as e:
            Logger.error(f"Android recording error: {e}")
            return None
    
    def _record_audio_desktop(self):
        """Record audio on desktop"""
        try:
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
            
            return temp_path
            
        except Exception as e:
            Logger.error(f"Desktop recording error: {e}")
            return None
    
    def _analyze_with_hf_api(self, audio_file):
        """Analyze audio using HuggingFace API"""
        self.screen.update_status("🔄 Analyzing with AI...", [1, 1, 0.3, 1])
        self.screen.progress.value = 25
        
        def analyze():
            try:
                # Call HuggingFace API
                self.screen.progress.value = 50
                result = self.api_client.detect_deepfake(audio_file)
                self.screen.progress.value = 100
                
                # Update UI on main thread
                Clock.schedule_once(lambda dt: self._show_result(result), 0)
                
                # Cleanup temp file
                if 'temp' in audio_file:
                    try:
                        os.remove(audio_file)
                    except:
                        pass
                        
            except Exception as e:
                Clock.schedule_once(lambda dt: self._show_error(f"Analysis failed: {e}"), 0)
            finally:
                Clock.schedule_once(lambda dt: self._reset_ui(), 0)
        
        threading.Thread(target=analyze, daemon=True).start()
    
    def _show_result(self, result):
        """Show analysis result"""
        self.screen.add_result(result)
        
        prediction = result.get('prediction', 'UNKNOWN')
        confidence = result.get('confidence', 0)
        
        if prediction == 'FAKE' and confidence > 0.7:
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
                vibrator.vibrate(1)
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
    
    def _reset_ui(self):
        """Reset UI after analysis"""
        self.screen.progress.value = 0
        self.screen.update_status("📱 Ready to Detect", [0.2, 0.7, 0.3, 1])
    
    def open_file_chooser(self):
        """Open file chooser for audio file selection"""
        try:
            content = BoxLayout(orientation='vertical')
            
            if platform == 'android':
                initial_path = "/storage/emulated/0/"
            else:
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
                    self._analyze_with_hf_api(selected_file)
            
            def cancel_selection(*args):
                popup.dismiss()
            
            select_btn.bind(on_release=select_file)
            cancel_btn.bind(on_release=cancel_selection)
            
            popup.open()
            
        except Exception as e:
            Logger.error(f"File chooser error: {e}")
            self._show_error(f"File selection failed: {str(e)}")

def main():
    """Main function to run the mobile app"""
    try:
        app = DeepfakeMobileApp()
        app.run()
    except Exception as e:
        print(f"❌ App startup error: {e}")
        print("Make sure all dependencies are installed:")
        print("pip install kivy kivymd requests plyer")

if __name__ == "__main__":
    main()