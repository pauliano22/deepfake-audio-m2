import torch
import gradio as gr
from deepfake_detector import DeepfakeDetectorCNN, AudioFeatureExtractor

def create_demo():
    """Create and launch Gradio demo"""
    
    # Load model
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = DeepfakeDetectorCNN()
    model.load_state_dict(torch.load('models/best_deepfake_detector.pth', map_location=device))
    model.eval()
    model.to(device)
    
    feature_extractor = AudioFeatureExtractor()
    
    def predict_audio_file(audio_file):
        """Predict if uploaded audio is fake"""
        try:
            if audio_file is None:
                return "Please upload an audio file"
            
            features = feature_extractor.extract_mel_spectrogram(audio_file)
            
            if features is None:
                return "Error processing audio file"
            
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
        theme="default"
    )
    
    return interface

if __name__ == "__main__":
    print("🚀 Starting Gradio Demo...")
    demo = create_demo()
    demo.launch(share=True)