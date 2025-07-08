# Chrome Extension Backend Server for Deepfake Detection
# This runs a local web server that the Chrome extension connects to

from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import librosa
import soundfile as sf
import numpy as np
import tempfile
import os
import base64
import io
from datetime import datetime
import json
import threading
import time

# Import your model
from deepfake_detector import DeepfakeDetectorCNN, AudioFeatureExtractor

class ChromeExtensionServer:
    """Backend server for Chrome extension deepfake detection"""
    
    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)  # Enable CORS for Chrome extension
        
        # Load model
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.feature_extractor = None
        self.load_model()
        
        # Detection history
        self.detections = []
        
        # Setup routes
        self.setup_routes()
    
    def load_model(self):
        """Load the trained deepfake detection model"""
        try:
            model_path = 'models/best_deepfake_detector.pth'
            if not os.path.exists(model_path):
                raise FileNotFoundError("Model not found! Please train the model first.")
            
            self.model = DeepfakeDetectorCNN()
            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
            self.model.eval()
            self.model.to(self.device)
            
            self.feature_extractor = AudioFeatureExtractor()
            print("✅ Model loaded for Chrome extension!")
            
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            raise
    
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
                
                # Process audio
                result = self.process_audio_chunk(audio_bytes, url, source)
                
                return jsonify(result)
                
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/api/status', methods=['GET'])
        def get_status():
            """Get server status"""
            return jsonify({
                'status': 'running',
                'model_loaded': self.model is not None,
                'device': str(self.device),
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
    
    def process_audio_chunk(self, audio_bytes, url, source):
        """Process audio chunk and detect deepfakes"""
        try:
            # Create temporary file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_file.write(audio_bytes)
                temp_path = temp_file.name
            
            # Extract features
            features = self.feature_extractor.extract_mel_spectrogram(temp_path)
            
            if features is None:
                os.unlink(temp_path)
                return {'error': 'Failed to extract features'}
            
            # Predict
            features_tensor = torch.FloatTensor(features).unsqueeze(0).unsqueeze(0)
            features_tensor = features_tensor.to(self.device)
            
            with torch.no_grad():
                outputs = self.model(features_tensor)
                probabilities = torch.softmax(outputs, dim=1)
                fake_prob = probabilities[0][1].item()
                real_prob = probabilities[0][0].item()
            
            # Clean up
            os.unlink(temp_path)
            
            # Create result
            result = {
                'timestamp': datetime.now().isoformat(),
                'url': url,
                'source': source,
                'fake_probability': fake_prob,
                'real_probability': real_prob,
                'prediction': 'FAKE' if fake_prob > 0.5 else 'REAL',
                'confidence': max(fake_prob, real_prob),
                'is_suspicious': fake_prob > 0.7
            }
            
            # Store detection
            self.detections.append(result)
            
            # Keep only last 1000 detections
            if len(self.detections) > 1000:
                self.detections = self.detections[-1000:]
            
            return result
            
        except Exception as e:
            return {'error': str(e)}
    
    def run(self, host='localhost', port=8765):
        """Run the Flask server"""
        print(f"🌐 Starting Chrome Extension server on http://{host}:{port}")
        print("🔌 Chrome extension can now connect!")
        self.app.run(host=host, port=port, debug=False)

# Chrome Extension Files (save these as separate files)

MANIFEST_JSON = '''
{
  "manifest_version": 3,
  "name": "Deepfake Audio Detector",
  "version": "1.0",
  "description": "Detects AI-generated voices in web audio",
  "permissions": [
    "activeTab",
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "http://localhost:8765/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Deepfake Detector"
  },
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
'''

POPUP_HTML = '''
<!DOCTYPE html>
<html>
<head>
    <style>
        body { width: 300px; padding: 15px; font-family: Arial, sans-serif; }
        .header { text-align: center; margin-bottom: 15px; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .status.active { background: #d4edda; color: #155724; }
        .status.inactive { background: #f8d7da; color: #721c24; }
        .detection { 
            padding: 8px; 
            margin: 5px 0; 
            border-radius: 3px; 
            font-size: 12px;
        }
        .detection.fake { background: #f8d7da; }
        .detection.real { background: #d4edda; }
        button { 
            width: 100%; 
            padding: 8px; 
            margin: 5px 0; 
            border: none; 
            border-radius: 3px; 
            cursor: pointer;
        }
        .btn-primary { background: #007bff; color: white; }
        .btn-danger { background: #dc3545; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <h3>🎤 Deepfake Detector</h3>
    </div>
    
    <div id="status" class="status inactive">
        ❌ Server Disconnected
    </div>
    
    <button id="toggleBtn" class="btn-primary">Start Monitoring</button>
    <button id="clearBtn" class="btn-danger">Clear History</button>
    
    <div id="detections">
        <h4>Recent Detections:</h4>
        <div id="detectionList">No detections yet</div>
    </div>
    
    <script src="popup.js"></script>
</body>
</html>
'''

POPUP_JS = '''
let isMonitoring = false;
let serverUrl = 'http://localhost:8765';

document.addEventListener('DOMContentLoaded', async () => {
    await checkServerStatus();
    await loadDetections();
    
    document.getElementById('toggleBtn').addEventListener('click', toggleMonitoring);
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
    
    // Auto-refresh every 5 seconds
    setInterval(loadDetections, 5000);
});

async function checkServerStatus() {
    try {
        const response = await fetch(`${serverUrl}/api/status`);
        const data = await response.json();
        
        const statusEl = document.getElementById('status');
        if (data.status === 'running') {
            statusEl.className = 'status active';
            statusEl.textContent = '✅ Server Connected';
        }
    } catch (error) {
        const statusEl = document.getElementById('status');
        statusEl.className = 'status inactive';
        statusEl.textContent = '❌ Server Disconnected';
    }
}

async function toggleMonitoring() {
    const btn = document.getElementById('toggleBtn');
    
    if (isMonitoring) {
        // Stop monitoring
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'stopMonitoring'});
        });
        btn.textContent = 'Start Monitoring';
        isMonitoring = false;
    } else {
        // Start monitoring
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'startMonitoring'});
        });
        btn.textContent = 'Stop Monitoring';
        isMonitoring = true;
    }
}

async function loadDetections() {
    try {
        const response = await fetch(`${serverUrl}/api/history`);
        const data = await response.json();
        
        const listEl = document.getElementById('detectionList');
        
        if (data.detections.length === 0) {
            listEl.innerHTML = 'No detections yet';
            return;
        }
        
        listEl.innerHTML = data.detections.slice(-5).map(detection => {
            const time = new Date(detection.timestamp).toLocaleTimeString();
            const confidence = (detection.confidence * 100).toFixed(1);
            const className = detection.prediction === 'FAKE' ? 'fake' : 'real';
            
            return `<div class="detection ${className}">
                ${time}: ${detection.prediction} (${confidence}%)
                <br><small>${detection.source}</small>
            </div>`;
        }).join('');
        
    } catch (error) {
        console.error('Failed to load detections:', error);
    }
}

async function clearHistory() {
    try {
        await fetch(`${serverUrl}/api/clear_history`, {method: 'POST'});
        await loadDetections();
    } catch (error) {
        console.error('Failed to clear history:', error);
    }
}
'''

CONTENT_JS = '''
let isMonitoring = false;
let audioContext;
let mediaStreamSource;
let processor;
let serverUrl = 'http://localhost:8765';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startMonitoring') {
        startAudioMonitoring();
    } else if (request.action === 'stopMonitoring') {
        stopAudioMonitoring();
    }
});

async function startAudioMonitoring() {
    if (isMonitoring) return;
    
    try {
        // Capture tab audio
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: false
        });
        
        audioContext = new AudioContext();
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        
        // Create processor for audio analysis
        await audioContext.audioWorklet.addModule(createAudioWorkletProcessor());
        processor = new AudioWorkletNode(audioContext, 'deepfake-processor');
        
        processor.port.onmessage = (event) => {
            if (event.data.type === 'audioData') {
                analyzeAudioChunk(event.data.audioData);
            }
        };
        
        mediaStreamSource.connect(processor);
        processor.connect(audioContext.destination);
        
        isMonitoring = true;
        console.log('🎤 Deepfake monitoring started');
        
    } catch (error) {
        console.error('Failed to start audio monitoring:', error);
    }
}

function stopAudioMonitoring() {
    if (!isMonitoring) return;
    
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    
    if (mediaStreamSource) {
        mediaStreamSource.disconnect();
        mediaStreamSource = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    isMonitoring = false;
    console.log('⏹️ Deepfake monitoring stopped');
}

async function analyzeAudioChunk(audioData) {
    try {
        // Convert audio data to base64
        const audioBlob = new Blob([audioData], { type: 'audio/wav' });
        const audioBase64 = await blobToBase64(audioBlob);
        
        // Send to server for analysis
        const response = await fetch(`${serverUrl}/api/detect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audio_data: audioBase64,
                url: window.location.href,
                source: 'Web Audio'
            })
        });
        
        const result = await response.json();
        
        // Show notification for suspicious audio
        if (result.is_suspicious) {
            showDeepfakeAlert(result);
        }
        
    } catch (error) {
        console.error('Audio analysis failed:', error);
    }
}

function showDeepfakeAlert(result) {
    // Create visual alert
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 15px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    alert.innerHTML = `
        🚨 DEEPFAKE DETECTED!<br>
        Confidence: ${(result.confidence * 100).toFixed(1)}%<br>
        <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 5px 10px; border: none; border-radius: 3px; background: white; color: black; cursor: pointer;">Dismiss</button>
    `;
    
    document.body.appendChild(alert);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 10000);
    
    // Browser notification
    if (Notification.permission === 'granted') {
        new Notification('Deepfake Detected!', {
            body: `Suspicious AI-generated audio detected (${(result.confidence * 100).toFixed(1)}% confidence)`,
            icon: 'icon48.png'
        });
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function createAudioWorkletProcessor() {
    return `
        class DeepfakeProcessor extends AudioWorkletProcessor {
            constructor() {
                super();
                this.bufferSize = 4096;
                this.buffer = new Float32Array(this.bufferSize);
                this.bufferIndex = 0;
            }
            
            process(inputs, outputs, parameters) {
                const input = inputs[0];
                
                if (input.length > 0) {
                    const inputChannel = input[0];
                    
                    for (let i = 0; i < inputChannel.length; i++) {
                        this.buffer[this.bufferIndex] = inputChannel[i];
                        this.bufferIndex++;
                        
                        if (this.bufferIndex >= this.bufferSize) {
                            // Send buffer to main thread
                            this.port.postMessage({
                                type: 'audioData',
                                audioData: this.buffer.slice()
                            });
                            
                            this.bufferIndex = 0;
                        }
                    }
                }
                
                return true;
            }
        }
        
        registerProcessor('deepfake-processor', DeepfakeProcessor);
    `;
}
'''

BACKGROUND_JS = '''
// Background service worker for Chrome extension

chrome.runtime.onInstalled.addListener(() => {
    console.log('Deepfake Detector extension installed');
});

// Handle notifications
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'showNotification') {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Deepfake Detected!',
            message: request.message
        });
    }
});
'''

def create_extension_files():
    """Create all Chrome extension files"""
    extension_dir = Path("chrome_extension")
    extension_dir.mkdir(exist_ok=True)
    
    # Write all files
    files = {
        "manifest.json": MANIFEST_JSON,
        "popup.html": POPUP_HTML,
        "popup.js": POPUP_JS,
        "content.js": CONTENT_JS,
        "background.js": BACKGROUND_JS
    }
    
    for filename, content in files.items():
        with open(extension_dir / filename, 'w', encoding='utf-8') as f:
            f.write(content)
    
    print(f"✅ Chrome extension files created in {extension_dir}/")
    print("\n📋 Installation Instructions:")
    print("1. Open Chrome and go to chrome://extensions/")
    print("2. Enable 'Developer mode' (top right)")
    print("3. Click 'Load unpacked'")
    print(f"4. Select the {extension_dir} folder")
    print("5. The extension icon will appear in your toolbar!")

def main():
    """Main function - run the server and create extension files"""
    print("🌐 Starting Chrome Extension Backend...")
    
    # Create extension files
    create_extension_files()
    
    # Start server
    server = ChromeExtensionServer()
    server.run()

if __name__ == "__main__":
    main()