# mobile_app_with_hf.py - Mobile app using HuggingFace API
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.clock import Clock
from kivymd.app import MDApp
from kivymd.uix.screen import MDScreen
from kivymd.uix.button import MDRaisedButton
from kivymd.uix.label import MDLabel
from kivymd.uix.card import MDCard
from kivymd.uix.boxlayout import MDBoxLayout

import threading
import tempfile
import os
from datetime import datetime
from pathlib import Path

# Import our HuggingFace API client
from hf_api_client import HuggingFaceDeepfakeAPI

class DeepfakeDetectionScreen(MDScreen):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.app = None
        self.build_ui()
    
    def build_ui(self):
        main_layout = MDBoxLayout(orientation='vertical', spacing=10, padding=20)
        
        # Status display
        self.status_label = MDLabel(
            text="📱 Ready to Detect", 
            size_hint_y=None, 
            height=60, 
            halign="center"
        )
        main_layout.add_widget(self.status_label)
        
        # Record button
        self.record_btn = MDRaisedButton(
            text="🎙️ Record Audio",
            on_release=self.start_recording,
            size_hint_y=None,
            height=60
        )
        main_layout.add_widget(self.record_btn)
        
        # Upload button  
        self.upload_btn = MDRaisedButton(
            text="📁 Upload File",
            on_release=self.upload_file,
            size_hint_y=None,
            height=60
        )
        main_layout.add_widget(self.upload_btn)
        
        # Results display
        self.results_layout = MDBoxLayout(orientation='vertical', spacing=10)
        main_layout.add_widget(self.results_layout)
        
        self.add_widget(main_layout)
    
    def start_recording(self, *args):
        if self.app:
            self.app.start_recording()
    
    def upload_file(self, *args):
        if self.app:
            self.app.upload_file()
    
    def update_status(self, text):
        self.status_label.text = text
    
    def add_result(self, result):
        timestamp = datetime.now().strftime("%H:%M:%S")
        prediction = result.get('prediction', 'UNKNOWN')
        confidence = result.get('confidence', 0) * 100
        
        result_text = f"⏰ {timestamp}\n🎯 {prediction}\n📊 {confidence:.1f}% confidence"
        
        result_card = MDCard(
            MDLabel(text=result_text, size_hint_y=None, height=80),
            size_hint_y=None,
            height=100,
            elevation=2
        )
        
        self.results_layout.add_widget(result_card)
        
        # Keep only last 5 results
        if len(self.results_layout.children) > 5:
            self.results_layout.remove_widget(self.results_layout.children[-1])

class DeepfakeMobileApp(MDApp):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Initialize HuggingFace API client
        self.api_client = HuggingFaceDeepfakeAPI()
        
        # Settings
        self.is_recording = False
        
    def build(self):
        self.screen = DeepfakeDetectionScreen()
        self.screen.app = self
        return self.screen
    
    def start_recording(self):
        """Start audio recording"""
        if self.is_recording:
            self.stop_recording()
            return
            
        self.is_recording = True
        self.screen.update_status("🔴 Recording...")
        self.screen.record_btn.text = "⏹️ Stop Recording"
        
        # Start recording in background thread
        threading.Thread(target=self._record_audio_thread, daemon=True).start()
    
    def stop_recording(self):
        """Stop recording"""
        self.is_recording = False
        self.screen.record_btn.text = "🎙️ Record Audio"
    
    def _record_audio_thread(self):
        """Record audio and analyze with HuggingFace API"""
        try:
            # Record audio (platform-specific implementation)
            audio_file = self._record_platform_audio()
            
            if audio_file and os.path.exists(audio_file):
                Clock.schedule_once(lambda dt: self._analyze_with_hf(audio_file), 0)
            else:
                Clock.schedule_once(lambda dt: self._show_error("Recording failed"), 0)
                
        except Exception as e:
            Clock.schedule_once(lambda dt: self._show_error(f"Recording error: {e}"), 0)
        finally:
            self.is_recording = False
            Clock.schedule_once(lambda dt: self.stop_recording(), 0)
    
    def _record_platform_audio(self):
        """Platform-specific audio recording"""
        try:
            from kivy.utils import platform
            
            if platform == 'android':
                return self._record_android()
            else:
                return self._record_desktop()
                
        except Exception as e:
            print(f"Recording error: {e}")
            return None
    
    def _record_android(self):
        """Record audio on Android"""
        try:
            from plyer import audio
            audio_path = "/storage/emulated/0/temp_recording.wav"
            audio.record(audio_path, duration=5)
            
            import time
            time.sleep(5.5)  # Wait for recording
            
            return audio_path if os.path.exists(audio_path) else None
            
        except Exception as e:
            print(f"Android recording error: {e}")
            return None
    
    def _record_desktop(self):
        """Record audio on desktop"""
        try:
            import pyaudio
            import wave
            
            FORMAT = pyaudio.paInt16
            CHANNELS = 1
            RATE = 22050
            CHUNK = 1024
            RECORD_SECONDS = 5
            
            audio = pyaudio.PyAudio()
            stream = audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=RATE,
                input=True,
                frames_per_buffer=CHUNK
            )
            
            frames = []
            for _ in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
                if not self.is_recording:
                    break
                data = stream.read(CHUNK)
                frames.append(data)
            
            stream.stop_stream()
            stream.close()
            audio.terminate()
            
            # Save to temp file
            temp_path = tempfile.mktemp(suffix='.wav')
            wf = wave.open(temp_path, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(audio.get_sample_size(FORMAT))
            wf.setframerate(RATE)
            wf.writeframes(b''.join(frames))
            wf.close()
            
            return temp_path
            
        except Exception as e:
            print(f"Desktop recording error: {e}")
            return None
    
    def _analyze_with_hf(self, audio_file):
        """Analyze audio using HuggingFace API"""
        self.screen.update_status("🔄 Analyzing with AI...")
        
        def analyze():
            try:
                # Call HuggingFace API
                result = self.api_client.detect_deepfake(audio_file)
                
                # Update UI on main thread
                Clock.schedule_once(lambda dt: self._show_result(result), 0)
                
                # Cleanup temp file
                if audio_file.startswith('/tmp') or 'temp' in audio_file:
                    try:
                        os.remove(audio_file)
                    except:
                        pass
                        
            except Exception as e:
                Clock.schedule_once(lambda dt: self._show_error(f"Analysis failed: {e}"), 0)
            finally:
                Clock.schedule_once(lambda dt: self.screen.update_status("📱 Ready to Detect"), 0)
        
        threading.Thread(target=analyze, daemon=True).start()
    
    def upload_file(self):
        """Upload and analyze file"""
        # Implement file picker
        self.screen.update_status("📁 Select audio file...")
        
        # For now, just show that it would work
        self._show_error("File upload: Connect to platform file picker")
    
    def _show_result(self, result):
        """Show analysis result"""
        self.screen.add_result(result)
        
        prediction = result.get('prediction', 'UNKNOWN')
        confidence = result.get('confidence', 0)
        
        if prediction == 'FAKE' and confidence > 0.7:
            self.screen.update_status("🚨 DEEPFAKE DETECTED!")
        else:
            self.screen.update_status("✅ Analysis Complete")
    
    def _show_error(self, message):
        """Show error message"""
        self.screen.update_status(f"❌ {message}")

if __name__ == "__main__":
    app = DeepfakeMobileApp()
    app.run()