# debug_features.py - Run this in your ML project to compare features

import numpy as np
from deepfake_detector import AudioFeatureExtractor

def debug_feature_extraction(audio_path):
    """Extract features and print statistics for comparison"""
    
    print("🔍 DEBUG: Python feature extraction...")
    
    feature_extractor = AudioFeatureExtractor()
    features = feature_extractor.extract_mel_spectrogram(audio_path)
    
    if features is None:
        print("❌ Failed to extract features")
        return
    
    # Ensure it's the right shape and flatten if needed
    if len(features.shape) > 1:
        features = features.flatten()
    
    # Print statistics
    print(f"✅ Python Feature Statistics:")
    print(f"   Length: {len(features)}")
    print(f"   Min Value: {np.min(features):.6f}")
    print(f"   Max Value: {np.max(features):.6f}")
    print(f"   Mean Value: {np.mean(features):.6f}")
    
    print(f"\n📊 Sample Values:")
    print(f"   Value at index 1000: {features[1000]:.6f}")
    print(f"   Value at index 5000: {features[5000]:.6f}")
    print(f"   Value at index 10000: {features[10000]:.6f}")
    print(f"   Value at index 15000: {features[15000]:.6f}")
    
    print(f"\n🔢 First 10 Values:")
    print([f"{v:.6f}" for v in features[:10]])
    
    print(f"\n🔢 Last 10 Values:")
    print([f"{v:.6f}" for v in features[-10:]])
    
    print(f"\n🔢 Raw features (first 20):")
    print([f"{v:.6f}" for v in features[:20]])
    
    print(f"\n🔢 Raw features (around middle):")
    middle_start = len(features) // 2 - 10
    middle_end = len(features) // 2 + 10
    print([f"{v:.6f}" for v in features[middle_start:middle_end]])
    
    return features

if __name__ == "__main__":
    # Replace with the path to the same audio file you're testing
    # Use raw string (r"") or forward slashes for Windows paths
    audio_file = r"C:\Users\pmi\Downloads\human.wav"  # UPDATE THIS PATH
    # OR use forward slashes: "C:/Users/pmi/Downloads/human.wav"
    
    print("🎵 Testing the same audio file that gave 100% human in Gradio...")
    features = debug_feature_extraction(audio_file)
    
    print(f"\n📋 Copy these statistics and compare with JavaScript version!")

# How to use:
# 1. Put this script in your deepfake-audio-m2 directory
# 2. Update the audio_file path to your test file
# 3. Run: python debug_features.py
# 4. Compare the output with the JavaScript version