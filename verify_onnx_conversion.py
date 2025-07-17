# verify_onnx_conversion.py - Verify ONNX matches PyTorch exactly

import torch
import onnxruntime as ort
import numpy as np
from deepfake_detector import DeepfakeDetectorCNN, AudioFeatureExtractor
import librosa

def test_onnx_vs_pytorch():
    """Test that ONNX model produces identical results to PyTorch"""
    
    print("🔍 Verifying ONNX conversion accuracy...")
    
    # Load PyTorch model
    device = torch.device('cpu')
    pytorch_model = DeepfakeDetectorCNN()
    pytorch_model.load_state_dict(torch.load('models/best_deepfake_detector.pth', map_location=device))
    pytorch_model.eval()
    
    # Load ONNX model
    onnx_session = ort.InferenceSession('onnx_models/deepfake_detector.onnx')
    
    # Test with a real audio file
    extractor = AudioFeatureExtractor()
    
    # Create test input - use a real audio file if available
    test_files = ['data/real/real_000.wav', 'data/fake/gtts_000.wav']
    
    for test_file in test_files:
        try:
            print(f"\n📁 Testing with {test_file}...")
            
            # Extract features using Python (ground truth)
            features = extractor.extract_mel_spectrogram(test_file)
            
            if features is None:
                print(f"❌ Could not extract features from {test_file}")
                continue
            
            # Convert to PyTorch tensor
            pytorch_input = torch.FloatTensor(features).unsqueeze(0).unsqueeze(0)
            
            # PyTorch prediction
            with torch.no_grad():
                pytorch_output = pytorch_model(pytorch_input)
                pytorch_probs = torch.softmax(pytorch_output, dim=1)
            
            # ONNX prediction
            onnx_input = pytorch_input.numpy()
            onnx_output = onnx_session.run(None, {'audio_features': onnx_input})[0]
            onnx_probs = torch.softmax(torch.from_numpy(onnx_output), dim=1)
            
            # Compare results
            pytorch_fake_prob = pytorch_probs[0][1].item()
            onnx_fake_prob = onnx_probs[0][1].item()
            
            difference = abs(pytorch_fake_prob - onnx_fake_prob)
            
            print(f"PyTorch fake probability: {pytorch_fake_prob:.6f}")
            print(f"ONNX fake probability: {onnx_fake_prob:.6f}")
            print(f"Difference: {difference:.6f}")
            
            if difference < 0.001:
                print("✅ ONNX conversion is accurate!")
            else:
                print("⚠️ ONNX conversion has significant differences!")
                
        except Exception as e:
            print(f"❌ Error testing {test_file}: {e}")

def create_reference_features():
    """Create reference features that JavaScript can use for comparison"""
    
    print("\n📊 Creating reference features for JavaScript comparison...")
    
    extractor = AudioFeatureExtractor()
    test_files = ['data/real/real_000.wav', 'data/fake/gtts_000.wav']
    
    references = {}
    
    for test_file in test_files:
        try:
            print(f"Processing {test_file}...")
            
            # Load and process audio exactly like JavaScript should
            y, sr = librosa.load(test_file, sr=22050, duration=5.0)
            
            # Extract mel-spectrogram
            mel_spec = librosa.feature.melspectrogram(
                y=y, sr=sr, n_mels=128, hop_length=512, n_fft=2048
            )
            
            # Convert to dB
            mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
            
            # Resize to 128x128
            if mel_spec_db.shape[1] < 128:
                mel_spec_db = np.pad(mel_spec_db, 
                                   ((0, 0), (0, 128 - mel_spec_db.shape[1])), 
                                   mode='constant', constant_values=-80)
            else:
                mel_spec_db = mel_spec_db[:, :128]
            
            # Flatten for comparison
            features_flat = mel_spec_db.flatten()
            
            # Store reference data
            file_key = test_file.split('/')[-1].replace('.wav', '')
            references[file_key] = {
                'features_shape': mel_spec_db.shape,
                'features_min': float(np.min(features_flat)),
                'features_max': float(np.max(features_flat)),
                'features_mean': float(np.mean(features_flat)),
                'features_std': float(np.std(features_flat)),
                'sample_values': {
                    '1000': float(features_flat[1000]) if len(features_flat) > 1000 else None,
                    '5000': float(features_flat[5000]) if len(features_flat) > 5000 else None,
                    '10000': float(features_flat[10000]) if len(features_flat) > 10000 else None,
                },
                'first_10': [float(x) for x in features_flat[:10]]
            }
            
            print(f"Reference stats for {file_key}:")
            print(f"  Shape: {references[file_key]['features_shape']}")
            print(f"  Min: {references[file_key]['features_min']:.6f}")
            print(f"  Max: {references[file_key]['features_max']:.6f}")
            print(f"  Mean: {references[file_key]['features_mean']:.6f}")
            print(f"  Std: {references[file_key]['features_std']:.6f}")
            
        except Exception as e:
            print(f"❌ Error processing {test_file}: {e}")
    
    # Save references to JSON
    import json
    with open('reference_features.json', 'w') as f:
        json.dump(references, f, indent=2)
    
    print("✅ Reference features saved to reference_features.json")
    print("📋 Use these values to verify your JavaScript implementation!")

if __name__ == "__main__":
    # Test ONNX conversion accuracy
    test_onnx_vs_pytorch()
    
    # Create reference features for JavaScript
    create_reference_features()