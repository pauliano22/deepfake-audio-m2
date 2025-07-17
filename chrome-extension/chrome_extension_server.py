# chrome_extension_server.py - UPDATED to use HuggingFace API
from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import tempfile
import os
from datetime import datetime
import threading

# Import our HuggingFace API client
from hf_api_client import HuggingFaceDeepfakeAPI

class ChromeExtensionServer:
    """Backend server for Chrome extension deepfake detection"""
    
    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)  # Enable CORS for Chrome extension
        
        # Use HuggingFace API instead of local model
        self.api_client = HuggingFaceDeepfakeAPI()
        
        # Detection history
        self.detections = []
        
        # Setup routes
        self.setup_routes()
    
    def setup_routes(self):
        """Setup Flask routes for the Chrome extension"""
        
        @self.app.route('/api/detect', methods=['POST'])
        def detect_deepfake():
            """Main detection endpoint"""
            try:
                data = request.get_json()
                
                if 'audio_data' not in data:
                    return jsonify({'error': 'No audio data provided'}), 400
                
                # Decode base64 audio data
                audio_b64 = data['audio_data']
                audio_bytes = base64.b64decode(audio_b64)
                
                # Get metadata
                url = data.get('url', 'Unknown')
                source = data.get('source', 'Web Audio')
                
                # Process audio using HuggingFace API
                result = self.process_audio_chunk(audio_bytes, url, source)
                
                return jsonify(result)
                
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/api/status', methods=['GET'])
        def get_status():
            """Get server status"""
            return jsonify({
                'status': 'running',
                'api_connected': True,  # Always true since we use HF API
                'total_detections': len(self.detections)
            })
        
        @self.app.route('/api/history', methods=['GET'])
        def get_history():
            """Get detection history"""
            return jsonify({
                'detections': self.detections[-50:],  # Last 50 detections
                'total': len(self.detections)
            })
        
        @self.app.route('/api/clear_history', methods=['POST'])
        def clear_history():
            """Clear detection history"""
            self.detections.clear()
            return jsonify({'message': 'History cleared'})
        
        @self.app.route('/api/test', methods=['POST'])
        def test_detection():
            """Test endpoint for development"""
            test_result = {
                'timestamp': datetime.now().isoformat(),
                'url': 'test',
                'source': 'Test Detection',
                'fake_probability': 0.85,
                'real_probability': 0.15,
                'prediction': 'FAKE',
                'confidence': 0.85,
                'is_suspicious': True
            }
            
            self.detections.append(test_result)
            return jsonify(test_result)
    
    def process_audio_chunk(self, audio_bytes, url, source):
        """Process audio chunk using HuggingFace API"""
        try:
            print(f"🔄 Processing audio chunk from {source}")
            
            # Use HuggingFace API for detection
            api_result = self.api_client.detect_deepfake_from_bytes(audio_bytes)
            
            # Create result in expected format
            result = {
                'timestamp': datetime.now().isoformat(),
                'url': url,
                'source': source,
                'fake_probability': api_result.get('probabilities', {}).get('fake', 0.5),
                'real_probability': api_result.get('probabilities', {}).get('real', 0.5),
                'prediction': api_result.get('prediction', 'UNKNOWN'),
                'confidence': api_result.get('confidence', 0.5),
                'is_suspicious': api_result.get('is_suspicious', False),
                'raw_result': api_result.get('raw_result', ''),
                'error': api_result.get('error')
            }
            
            # Store detection if no error
            if not result.get('error'):
                self.detections.append(result)
                
                # Keep only last 1000 detections
                if len(self.detections) > 1000:
                    self.detections = self.detections[-1000:]
            
            print(f"✅ Detection complete: {result['prediction']} ({result['confidence']:.2f})")
            return result
            
        except Exception as e:
            print(f"❌ Detection error: {e}")
            return {
                'timestamp': datetime.now().isoformat(),
                'url': url,
                'source': source,
                'error': str(e),
                'prediction': 'ERROR',
                'confidence': 0.0,
                'fake_probability': 0.5,
                'real_probability': 0.5,
                'is_suspicious': False
            }
    
    def run(self, host='localhost', port=8765):
        """Run the Flask server"""
        print(f"🌐 Starting Chrome Extension server on http://{host}:{port}")
        print("🔌 Chrome extension can now connect!")
        print("🤖 Using HuggingFace API for detection")
        self.app.run(host=host, port=port, debug=False)

def main():
    """Main function - run the server"""
    print("🚀 Starting Chrome Extension Backend...")
    print("🤖 Using HuggingFace API (no local model needed)")
    
    server = ChromeExtensionServer()
    server.run()

if __name__ == "__main__":
    main()