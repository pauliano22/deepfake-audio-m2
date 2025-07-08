# Audio Deepfake Detection System - Complete Implementation
# Run this step by step to build your deepfake detector

# STEP 1: Install all required packages
"""
Run these commands in your terminal:

pip install torch torchvision torchaudio
pip install librosa soundfile
pip install scikit-learn pandas numpy matplotlib seaborn
pip install gradio
pip install pyaudio
pip install gTTS pyttsx3
pip install requests
pip install wandb
"""

# STEP 2: Project Structure Setup
import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import librosa
import soundfile as sf
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import matplotlib.pyplot as plt
import seaborn as sns
import gradio as gr
import pyaudio
import threading
import queue
import time
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# Create project structure
def setup_project_structure():
    """Create all necessary directories"""
    directories = [
        'data/real',
        'data/fake',
        'data/processed',
        'models',
        'notebooks',
        'demo'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
    print("✅ Project structure created!")

# STEP 3: Data Generation - Create fake voices using TTS
def generate_fake_audio_dataset():
    """Generate synthetic audio using TTS for training data"""
    try:
        import pyttsx3
        from gtts import gTTS
        import io
        
        # Sample texts for generation
        texts = [
            "Hello, this is a test of synthetic speech generation.",
            "The weather today is quite pleasant and sunny.",
            "Machine learning is revolutionizing technology.",
            "I enjoy listening to music in my free time.",
            "Artificial intelligence will change the world.",
            "Please verify your identity for security purposes.",
            "The meeting has been scheduled for tomorrow morning.",
            "Thank you for calling our customer service line.",
            "Your order has been processed and will ship soon.",
            "Welcome to our automated phone system.",
            "This is an important announcement for all users.",
            "The system will undergo maintenance tonight.",
            "Your payment has been successfully processed.",
            "Please hold while we connect you to an agent.",
            "The conference call will begin in five minutes."
        ]
        
        print("🎤 Generating fake audio samples...")
        
        # Method 1: Using pyttsx3 (offline TTS)
        engine = pyttsx3.init()
        engine.setProperty('rate', 150)
        
        for i, text in enumerate(texts):
            filename = f"data/fake/pyttsx3_{i:03d}.wav"
            engine.save_to_file(text, filename)
        engine.runAndWait()
        
        # Method 2: Using gTTS (Google TTS) - requires internet
        try:
            for i, text in enumerate(texts):
                tts = gTTS(text=text, lang='en', slow=False)
                filename = f"data/fake/gtts_{i:03d}.wav"
                tts.save(filename)
        except:
            print("⚠️ gTTS failed (no internet?), using only pyttsx3")
        
        print(f"✅ Generated fake audio samples in data/fake/")
        
    except ImportError:
        print("❌ TTS libraries not installed. Install with: pip install pyttsx3 gTTS")
        return False
    
    return True

# STEP 4: Record real audio samples
def record_real_audio():
    """Record real audio samples for training"""
    import pyaudio
    import wave
    
    print("🎙️ Recording real audio samples...")
    print("You'll record 15 short clips (5-10 seconds each)")
    print("Press Enter when ready, speak clearly, then we'll move to the next one")
    
    # Audio recording parameters
    FORMAT = pyaudio.paInt16
    CHANNELS = 1
    RATE = 22050
    CHUNK = 1024
    RECORD_SECONDS = 8
    
    texts_to_read = [
        "Hello, this is a test of synthetic speech generation.",
        "The weather today is quite pleasant and sunny.",
        "Machine learning is revolutionizing technology.",
        "I enjoy listening to music in my free time.",
        "Artificial intelligence will change the world.",
        "Please verify your identity for security purposes.",
        "The meeting has been scheduled for tomorrow morning.",
        "Thank you for calling our customer service line.",
        "Your order has been processed and will ship soon.",
        "Welcome to our automated phone system.",
        "This is an important announcement for all users.",
        "The system will undergo maintenance tonight.",
        "Your payment has been successfully processed.",
        "Please hold while we connect you to an agent.",
        "The conference call will begin in five minutes."
    ]
    
    audio = pyaudio.PyAudio()
    
    for i, text in enumerate(texts_to_read):
        input(f"\n📝 Read this text: '{text}'\nPress Enter when ready to record...")
        
        print(f"🔴 Recording {i+1}/15... Speak now!")
        
        stream = audio.open(format=FORMAT,
                          channels=CHANNELS,
                          rate=RATE,
                          input=True,
                          frames_per_buffer=CHUNK)
        
        frames = []
        for _ in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
            data = stream.read(CHUNK)
            frames.append(data)
        
        stream.stop_stream()
        stream.close()
        
        # Save the recording
        filename = f"data/real/real_{i:03d}.wav"
        wf = wave.open(filename, 'wb')
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(audio.get_sample_size(FORMAT))
        wf.setframerate(RATE)
        wf.writeframes(b''.join(frames))
        wf.close()
        
        print(f"✅ Saved {filename}")
    
    audio.terminate()
    print("🎉 All recordings complete!")

# STEP 5: Feature Extraction
class AudioFeatureExtractor:
    """Extract features from audio files"""
    
    def __init__(self, sample_rate=22050, n_mels=128, max_len=128):
        self.sample_rate = sample_rate
        self.n_mels = n_mels
        self.max_len = max_len
    
    def extract_mel_spectrogram(self, audio_path):
        """Extract mel-spectrogram features"""
        try:
            # Load audio
            y, sr = librosa.load(audio_path, sr=self.sample_rate, duration=5.0)
            
            # Extract mel-spectrogram
            mel_spec = librosa.feature.melspectrogram(
                y=y, sr=sr, n_mels=self.n_mels, hop_length=512
            )
            
            # Convert to log scale
            mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
            
            # Pad or truncate to fixed length
            if mel_spec_db.shape[1] < self.max_len:
                mel_spec_db = np.pad(mel_spec_db, 
                                   ((0, 0), (0, self.max_len - mel_spec_db.shape[1])), 
                                   mode='constant')
            else:
                mel_spec_db = mel_spec_db[:, :self.max_len]
            
            return mel_spec_db
            
        except Exception as e:
            print(f"Error processing {audio_path}: {e}")
            return None
    
    def extract_mfcc_features(self, audio_path):
        """Extract MFCC features as backup"""
        try:
            y, sr = librosa.load(audio_path, sr=self.sample_rate, duration=5.0)
            mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            
            # Pad or truncate
            if mfccs.shape[1] < self.max_len:
                mfccs = np.pad(mfccs, 
                             ((0, 0), (0, self.max_len - mfccs.shape[1])), 
                             mode='constant')
            else:
                mfccs = mfccs[:, :self.max_len]
                
            return mfccs
        except:
            return None

# STEP 6: Dataset Class
class AudioDataset(Dataset):
    """PyTorch dataset for audio deepfake detection"""
    
    def __init__(self, audio_paths, labels, feature_extractor):
        self.audio_paths = audio_paths
        self.labels = labels
        self.feature_extractor = feature_extractor
        
    def __len__(self):
        return len(self.audio_paths)
    
    def __getitem__(self, idx):
        audio_path = self.audio_paths[idx]
        label = self.labels[idx]
        
        # Extract features
        features = self.feature_extractor.extract_mel_spectrogram(audio_path)
        
        if features is None:
            # Return zero tensor if extraction fails
            features = np.zeros((128, 128))
        
        # Convert to tensor
        features = torch.FloatTensor(features).unsqueeze(0)  # Add channel dimension
        label = torch.LongTensor([label])
        
        return features, label.squeeze()

# STEP 7: CNN Model Architecture (FIXED WITH HIGHER DROPOUT)
class DeepfakeDetectorCNN(nn.Module):
    """CNN model for audio deepfake detection with anti-overtraining measures"""
    
    def __init__(self, num_classes=2):
        super(DeepfakeDetectorCNN, self).__init__()
        
        # Convolutional layers with HIGHER dropout
        self.conv_layers = nn.Sequential(
            # First conv block
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.4),  # INCREASED from 0.25
            
            # Second conv block
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.4),  # INCREASED from 0.25
            
            # Third conv block
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.5),  # INCREASED from 0.25
            
            # Fourth conv block
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.5),  # INCREASED from 0.25
        )
        
        # Calculate the size of flattened features
        # After 4 max pools (2x2), 128x128 becomes 8x8
        self.fc_layers = nn.Sequential(
            nn.Linear(256 * 8 * 8, 512),
            nn.ReLU(),
            nn.Dropout(0.6),  # INCREASED from 0.5
            nn.Linear(512, 128),
            nn.ReLU(),
            nn.Dropout(0.6),  # INCREASED from 0.5
            nn.Linear(128, num_classes)
        )
        
    def forward(self, x):
        x = self.conv_layers(x)
        x = x.view(x.size(0), -1)  # Flatten
        x = self.fc_layers(x)
        return x

# STEP 8: Training Function (FIXED TO PREVENT OVERTRAINING)
def train_model(model, train_loader, val_loader, num_epochs=12, device='cpu'):  # REDUCED epochs
    """Train the deepfake detection model with overtraining prevention"""
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.0005, weight_decay=1e-3)  # LOWER LR, HIGHER weight decay
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, 'min', patience=3)  # REDUCED patience
    
    train_losses = []
    val_losses = []
    train_accs = []
    val_accs = []
    
    best_val_acc = 0.0
    patience_counter = 0
    early_stop_patience = 5  # EARLY STOPPING
    
    model.to(device)
    
    print("🛡️ Training with overtraining prevention:")
    print(f"   • Reduced epochs: {num_epochs}")
    print(f"   • Lower learning rate: 0.0005")
    print(f"   • Higher dropout: 0.4-0.6")
    print(f"   • Early stopping patience: {early_stop_patience}")
    
    for epoch in range(num_epochs):
        # Training phase
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for batch_idx, (data, targets) in enumerate(train_loader):
            data, targets = data.to(device), targets.to(device)
            
            optimizer.zero_grad()
            outputs = model(data)
            loss = criterion(outputs, targets)
            loss.backward()
            
            # GRADIENT CLIPPING
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            
            optimizer.step()
            
            train_loss += loss.item()
            _, predicted = outputs.max(1)
            train_total += targets.size(0)
            train_correct += predicted.eq(targets).sum().item()
        
        # Validation phase
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        
        with torch.no_grad():
            for data, targets in val_loader:
                data, targets = data.to(device), targets.to(device)
                outputs = model(data)
                loss = criterion(outputs, targets)
                
                val_loss += loss.item()
                _, predicted = outputs.max(1)
                val_total += targets.size(0)
                val_correct += predicted.eq(targets).sum().item()
        
        # Calculate metrics
        train_acc = 100. * train_correct / train_total
        val_acc = 100. * val_correct / val_total
        
        train_losses.append(train_loss / len(train_loader))
        val_losses.append(val_loss / len(val_loader))
        train_accs.append(train_acc)
        val_accs.append(val_acc)
        
        # Learning rate scheduling
        scheduler.step(val_loss)
        
        # EARLY STOPPING LOGIC
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            torch.save(model.state_dict(), 'models/best_deepfake_detector.pth')
        else:
            patience_counter += 1
        
        # Print progress
        print(f'Epoch [{epoch+1}/{num_epochs}]')
        print(f'Train Loss: {train_loss/len(train_loader):.4f}, Train Acc: {train_acc:.2f}%')
        print(f'Val Loss: {val_loss/len(val_loader):.4f}, Val Acc: {val_acc:.2f}%')
        print(f'Best Val Acc: {best_val_acc:.2f}% | Patience: {patience_counter}/{early_stop_patience}')
        
        # OVERTRAINING WARNING
        if train_acc > val_acc + 15:
            print("⚠️ WARNING: Potential overtraining detected!")
        
        # EARLY STOPPING
        if patience_counter >= early_stop_patience:
            print(f"🛑 Early stopping! No improvement for {early_stop_patience} epochs")
            break
        
        print('-' * 50)
    
    return train_losses, val_losses, train_accs, val_accs

# STEP 9: Real-time Detection System
class RealTimeDetector:
    """Real-time audio deepfake detection"""
    
    def __init__(self, model_path, device='cpu'):
        self.device = device
        self.model = DeepfakeDetectorCNN()
        self.model.load_state_dict(torch.load(model_path, map_location=device))
        self.model.eval()
        self.model.to(device)
        
        self.feature_extractor = AudioFeatureExtractor()
        self.audio_queue = queue.Queue()
        self.is_monitoring = False
        
        # Audio recording parameters
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 22050
        self.CHUNK = 1024
        self.RECORD_SECONDS = 3  # Process 3-second chunks
        
    def audio_callback(self, in_data, frame_count, time_info, status):
        """Callback for audio stream"""
        if self.is_monitoring:
            self.audio_queue.put(in_data)
        return (in_data, pyaudio.paContinue)
    
    def predict_audio_chunk(self, audio_data):
        """Predict if audio chunk is fake"""
        try:
            # Convert audio data to numpy array
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
            audio_np = audio_np / 32768.0  # Normalize
            
            # Save temporary file for feature extraction
            temp_file = "temp_audio.wav"
            sf.write(temp_file, audio_np, self.RATE)
            
            # Extract features
            features = self.feature_extractor.extract_mel_spectrogram(temp_file)
            
            if features is None:
                return 0.5, "Error"
            
            # Convert to tensor and predict
            features_tensor = torch.FloatTensor(features).unsqueeze(0).unsqueeze(0)
            features_tensor = features_tensor.to(self.device)
            
            with torch.no_grad():
                outputs = self.model(features_tensor)
                probabilities = torch.softmax(outputs, dim=1)
                fake_prob = probabilities[0][1].item()  # Probability of being fake
                
                prediction = "FAKE" if fake_prob > 0.5 else "REAL"
                
            # Clean up temp file
            os.remove(temp_file)
            
            return fake_prob, prediction
            
        except Exception as e:
            print(f"Prediction error: {e}")
            return 0.5, "Error"
    
    def start_monitoring(self, alert_threshold=0.7):
        """Start real-time monitoring"""
        print("🎤 Starting real-time deepfake detection...")
        print(f"Alert threshold: {alert_threshold}")
        print("Speak into your microphone...")
        
        audio = pyaudio.PyAudio()
        
        stream = audio.open(
            format=self.FORMAT,
            channels=self.CHANNELS,
            rate=self.RATE,
            input=True,
            frames_per_buffer=self.CHUNK,
            stream_callback=self.audio_callback
        )
        
        self.is_monitoring = True
        stream.start_stream()
        
        try:
            while self.is_monitoring:
                if not self.audio_queue.empty():
                    # Collect audio for processing
                    audio_frames = []
                    frames_needed = int(self.RATE * self.RECORD_SECONDS / self.CHUNK)
                    
                    for _ in range(frames_needed):
                        if not self.audio_queue.empty():
                            audio_frames.append(self.audio_queue.get())
                    
                    if audio_frames:
                        audio_data = b''.join(audio_frames)
                        fake_prob, prediction = self.predict_audio_chunk(audio_data)
                        
                        print(f"Detection: {prediction} (confidence: {fake_prob:.3f})")
                        
                        # Alert if high fake probability
                        if fake_prob > alert_threshold:
                            print("🚨 ALERT: Potential deepfake detected! 🚨")
                            # You can add sound alerts here
                
                time.sleep(0.1)  # Small delay
                
        except KeyboardInterrupt:
            print("\n⏹️ Stopping monitoring...")
        
        finally:
            self.is_monitoring = False
            stream.stop_stream()
            stream.close()
            audio.terminate()

# STEP 10: Gradio Interface
def create_gradio_interface(model_path):
    """Create Gradio web interface"""
    
    # Load model
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = DeepfakeDetectorCNN()
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()
    model.to(device)
    
    feature_extractor = AudioFeatureExtractor()
    
    def predict_audio_file(audio_file):
        """Predict if uploaded audio is fake"""
        try:
            if audio_file is None:
                return "Please upload an audio file"
            
            # Extract features
            features = feature_extractor.extract_mel_spectrogram(audio_file)
            
            if features is None:
                return "Error processing audio file"
            
            # Convert to tensor and predict
            features_tensor = torch.FloatTensor(features).unsqueeze(0).unsqueeze(0)
            features_tensor = features_tensor.to(device)
            
            with torch.no_grad():
                outputs = model(features_tensor)
                probabilities = torch.softmax(outputs, dim=1)
                fake_prob = probabilities[0][1].item()
                real_prob = probabilities[0][0].item()
                
                result = f"""
                🎯 **Prediction Results:**
                
                🟢 **Real Voice**: {real_prob:.1%}
                🔴 **AI Generated**: {fake_prob:.1%}
                
                **Verdict**: {'🚨 LIKELY AI GENERATED' if fake_prob > 0.5 else '✅ LIKELY REAL VOICE'}
                
                **Confidence**: {max(fake_prob, real_prob):.1%}
                """
                
                return result
                
        except Exception as e:
            return f"Error: {str(e)}"
    
    # Create interface
    interface = gr.Interface(
        fn=predict_audio_file,
        inputs=gr.Audio(type="filepath", label="Upload Audio File"),
        outputs=gr.Markdown(label="Detection Results"),
        title="🎤 Audio Deepfake Detector",
        description="""
        Upload an audio file to detect if it's real human speech or AI-generated.
        
        **Supported formats**: WAV, MP3, M4A
        **Best results**: Clear speech, 3-10 seconds long
        """,
        examples=[
            # You can add example files here
        ],
        theme="default"
    )
    
    return interface

# STEP 11: Main execution function (FIXED)
def main():
    """Main function to run everything"""
    print("🚀 Building Audio Deepfake Detector (FIXED VERSION)!")
    print("=" * 50)
    
    # Step 1: Setup
    setup_project_structure()
    
    # Step 2: Generate data
    print("\n📊 Generating training data...")
    generate_fake_audio_dataset()
    
    # Ask user if they want to record real audio
    record_choice = input("\n🎙️ Do you want to record real audio samples? (y/n): ").lower()
    if record_choice == 'y':
        record_real_audio()
    else:
        print("⚠️ Skipping real audio recording. Model will use existing samples only.")
    
    # Step 3: Prepare dataset
    print("\n🔄 Preparing dataset...")
    real_files = list(Path("data/real").glob("*.wav"))
    fake_files = list(Path("data/fake").glob("*.wav"))
    
    print(f"Real audio files: {len(real_files)}")
    print(f"Fake audio files: {len(fake_files)}")
    
    if len(real_files) == 0 or len(fake_files) == 0:
        print("❌ Not enough data! Need both real and fake audio samples.")
        return
    
    # Prepare data
    all_files = real_files + fake_files
    all_labels = [0] * len(real_files) + [1] * len(fake_files)  # 0=real, 1=fake
    
    # LARGER validation split to prevent overtraining
    validation_split = 0.4 if len(all_files) < 500 else 0.3
    
    # Split data
    train_files, val_files, train_labels, val_labels = train_test_split(
        all_files, all_labels, test_size=validation_split, random_state=42, stratify=all_labels
    )
    
    print(f"Training samples: {len(train_files)}")
    print(f"Validation samples: {len(val_files)} ({validation_split:.0%} of total)")
    
    # Create datasets
    feature_extractor = AudioFeatureExtractor()
    train_dataset = AudioDataset(train_files, train_labels, feature_extractor)
    val_dataset = AudioDataset(val_files, val_labels, feature_extractor)
    
    # Create data loaders with SMALLER batch size
    batch_size = min(4, len(train_files) // 10)  # Smaller batches
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    # Step 4: Train model
    print("\n🧠 Training model with overtraining prevention...")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    model = DeepfakeDetectorCNN()
    
    # REDUCED epochs based on dataset size
    num_epochs = min(12, max(8, len(train_files) // 20))
    print(f"Training for {num_epochs} epochs...")
    
    train_losses, val_losses, train_accs, val_accs = train_model(
        model, train_loader, val_loader, num_epochs=num_epochs, device=device
    )
    
    print("✅ Training complete!")
    
    # Step 5: Create interfaces
    choice = input("\n🎯 What would you like to do next?\n1. Launch Gradio web interface\n2. Start real-time monitoring\n3. Both\nChoice (1/2/3): ")
    
    if choice in ['1', '3']:
        print("\n🌐 Launching Gradio interface...")
        interface = create_gradio_interface('models/best_deepfake_detector.pth')
        interface.launch(share=True)
    
    if choice in ['2', '3']:
        print("\n🎤 Starting real-time monitoring...")
        detector = RealTimeDetector('models/best_deepfake_detector.pth', device=device)
        detector.start_monitoring(alert_threshold=0.7)

if __name__ == "__main__":
    main()