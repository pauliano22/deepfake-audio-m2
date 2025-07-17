# fixed_convert_to_onnx.py - Updated conversion script

import torch
import torch.onnx
import numpy as np
from deepfake_detector import DeepfakeDetectorCNN, AudioFeatureExtractor
import json
import os

def convert_pytorch_to_onnx():
    """Convert your PyTorch deepfake detector to ONNX format"""
    
    print("🔄 Converting PyTorch model to ONNX...")
    
    # Load your trained model
    device = torch.device('cpu')
    model = DeepfakeDetectorCNN()
    
    # Check if model file exists
    model_path = 'models/best_deepfake_detector.pth'
    if not os.path.exists(model_path):
        print(f"❌ Model file not found at {model_path}")
        print("Available files in models/:")
        if os.path.exists('models/'):
            for f in os.listdir('models/'):
                print(f"  - {f}")
        return None
    
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()
    
    # Create output directory in current folder (not public/)
    output_dir = "onnx_models"
    os.makedirs(output_dir, exist_ok=True)
    
    # Test with dummy input to determine correct shape
    # Try different common shapes for mel spectrograms
    possible_shapes = [
        (1, 1, 128, 128),  # Most common
        (1, 1, 80, 80),
        (1, 1, 64, 64),
        (1, 128, 128),     # Without channel dimension
    ]
    
    working_shape = None
    for shape in possible_shapes:
        try:
            dummy_input = torch.randn(shape)
            with torch.no_grad():
                test_output = model(dummy_input)
                print(f"✅ Shape {shape} works! Output: {test_output.shape}")
                working_shape = shape
                break
        except Exception as e:
            print(f"❌ Shape {shape} failed: {e}")
    
    if not working_shape:
        print("❌ Could not determine correct input shape!")
        return None
    
    # Use the working shape
    dummy_input = torch.randn(working_shape)
    
    # Export to ONNX in current directory
    onnx_path = os.path.join(output_dir, "deepfake_detector.onnx")
    
    print(f"🔄 Exporting to {onnx_path}...")
    
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['audio_features'],
        output_names=['predictions'],
        dynamic_axes={
            'audio_features': {0: 'batch_size'},
            'predictions': {0: 'batch_size'}
        },
        verbose=False  # Less verbose output
    )
    
    print(f"✅ Model exported to {onnx_path}")
    
    # Save model metadata
    metadata = {
        "input_shape": list(working_shape),
        "input_name": "audio_features",
        "output_name": "predictions",
        "model_info": {
            "framework": "pytorch",
            "opset_version": 11,
            "description": "Deepfake audio detection model"
        }
    }
    
    metadata_path = os.path.join(output_dir, "model_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Metadata saved to {metadata_path}")
    
    # Check file size
    size_mb = os.path.getsize(onnx_path) / (1024 * 1024)
    print(f"📊 ONNX model size: {size_mb:.2f} MB")
    
    print(f"\n📁 Files created in {output_dir}/:")
    for f in os.listdir(output_dir):
        size = os.path.getsize(os.path.join(output_dir, f)) / (1024 * 1024)
        print(f"  - {f} ({size:.2f} MB)")
    
    return onnx_path

def test_onnx_model():
    """Test the exported ONNX model"""
    
    onnx_path = "onnx_models/deepfake_detector.onnx"
    
    if not os.path.exists(onnx_path):
        print(f"❌ ONNX model not found at {onnx_path}")
        return
    
    print(f"\n🧪 Testing ONNX model at {onnx_path}...")
    
    try:
        import onnxruntime as ort
        
        # Load ONNX model
        session = ort.InferenceSession(onnx_path)
        
        # Get input/output info
        input_info = session.get_inputs()[0]
        output_info = session.get_outputs()[0]
        
        print(f"✅ ONNX model loaded successfully!")
        print(f"Input: {input_info.name} {input_info.shape}")
        print(f"Output: {output_info.name} {output_info.shape}")
        
        # Test with dummy data
        input_shape = input_info.shape
        # Replace None with 1 for batch size
        actual_shape = [1 if dim is None else dim for dim in input_shape]
        dummy_input = np.random.randn(*actual_shape).astype(np.float32)
        
        # Run inference
        outputs = session.run(None, {input_info.name: dummy_input})
        print(f"✅ ONNX inference successful!")
        print(f"Output shape: {outputs[0].shape}")
        print(f"Output values: {outputs[0]}")
        
    except ImportError:
        print("⚠️  onnxruntime not installed. Install with: pip install onnxruntime")
    except Exception as e:
        print(f"❌ ONNX test failed: {e}")

if __name__ == "__main__":
    print("🚀 Starting ONNX conversion...")
    
    # Convert model
    onnx_path = convert_pytorch_to_onnx()
    
    if onnx_path:
        # Test the conversion
        test_onnx_model()
        
        print(f"\n🎯 Next steps:")
        print(f"1. Copy onnx_models/ folder contents to your frontend:")
        print(f"   cp onnx_models/* /path/to/lion-project/public/models/")
        print(f"2. Continue with frontend setup")
    else:
        print("❌ Conversion failed. Check the errors above.")