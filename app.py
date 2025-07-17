import torch
import gradio as gr
import numpy as np
import librosa
import torch.nn as nn

# Copy your exact CNN model class
class DeepfakeDetectorCNN(nn.Module):
    def __init__(self, num_classes=2):
        super(DeepfakeDetectorCNN, self).__init__()
        
        self.conv_layers = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.4),
            
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.4),
            
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.5),
            
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.5),
        )
        
        self.fc_layers = nn.Sequential(
            nn.Linear(256 * 8 * 8, 512),
            nn.ReLU(),
            nn.Dropout(0.6),
            nn.Linear(512, 128),
            nn.ReLU(),
            nn.Dropout(0.6),
            nn.Linear(128, num_classes)
        )
        
    def forward(self, x):
        x = self.conv_layers(x)
        x = x.view(x.size(0), -1)
        x = self.fc_layers(x)
        return x

# Copy your exact feature extractor
class AudioFeatureExtractor:
    def __init__(self, sample_rate=22050, n_mels=128, max_len=128):
        self.sample_rate = sample_rate
        self.n_mels = n_mels
        self.max_len = max_len
    
    def extract_mel_spectrogram(self, audio_path):
        try:
            y, sr = librosa.load(audio_path, sr=self.sample_rate, duration=5.0)
            
            mel_spec = librosa.feature.melspectrogram(
                y=y, sr=sr, n_mels=self.n_mels, hop_length=512
            )
            
            mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
            
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

# Load model (you'll upload your .pth file)
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = DeepfakeDetectorCNN()
model.load_state_dict(torch.load('best_deepfake_detector.pth', map_location=device))
model.eval()
model.to(device)

feature_extractor = AudioFeatureExtractor()

def predict_audio_file(audio_file):
    """Predict if uploaded audio is fake - Returns JSON for API"""
    try:
        if audio_file is None:
            return {"error": "Please upload an audio file"}
        
        features = feature_extractor.extract_mel_spectrogram(audio_file)
        
        if features is None:
            return {"error": "Error processing audio file"}
        
        features_tensor = torch.FloatTensor(features).unsqueeze(0).unsqueeze(0)
        features_tensor = features_tensor.to(device)
        
        with torch.no_grad():
            outputs = model(features_tensor)
            probabilities = torch.softmax(outputs, dim=1)
            fake_prob = probabilities[0][1].item()
            real_prob = probabilities[0][0].item()
            
            # Return structured data for API use
            return {
                "prediction": "FAKE" if fake_prob > 0.5 else "REAL",
                "confidence": max(fake_prob, real_prob),
                "probabilities": {
                    "real": real_prob,
                    "fake": fake_prob
                },
                "is_suspicious": fake_prob > 0.7,
                "details": {
                    "model_version": "1.0",
                    "processing_success": True
                }
            }
            
    except Exception as e:
        return {"error": str(e)}

def format_result_for_ui(result):
    """Format result for Gradio UI"""
    if "error" in result:
        return f"❌ Error: {result['error']}"
    
    real_prob = result["probabilities"]["real"]
    fake_prob = result["probabilities"]["fake"]
    
    return f"""
    🎯 **Prediction Results:**
    
    🟢 **Real Voice**: {real_prob:.1%}
    🔴 **AI Generated**: {fake_prob:.1%}
    
    **Verdict**: {'🚨 LIKELY AI GENERATED' if result['prediction'] == 'FAKE' else '✅ LIKELY REAL VOICE'}
    
    **Confidence**: {result['confidence']:.1%}
    """

# Create Gradio interface
interface = gr.Interface(
    fn=lambda audio: format_result_for_ui(predict_audio_file(audio)),
    inputs=gr.Audio(type="filepath", label="Upload Audio File"),
    outputs=gr.Markdown(label="Detection Results"),
    title="🎤 Audio Deepfake Detector",
    description="""
    Upload an audio file to detect if it's real human speech or AI-generated.
    
    **Supported formats**: WAV, MP3, M4A
    **Best results**: Clear speech, 3-10 seconds long
    """,
    api_name="predict"  # This enables API access
)

if __name__ == "__main__":
    interface.launch()