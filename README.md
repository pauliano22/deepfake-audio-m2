# 🎤 AI Deepfake Voice Detection Suite

> **Complete cross-platform solution for detecting AI-generated voices in real-time**

[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![HuggingFace](https://img.shields.io/badge/🤗-HuggingFace-yellow)](https://huggingface.co/spaces/pauliano22/deepfake-audio-detector)

## 🎯 What This Does

Detects AI-generated voices (like ElevenLabs, Murf, etc.) with 90%+ accuracy across:
- **🖥️ Desktop**: Background monitoring of all system audio
- **🌐 Chrome Extension**: Real-time web audio protection  
- **📱 Mobile App**: Portable audio verification tool
- **🌐 Web Demo**: Instant online testing

## 🏗️ System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│   Your Apps    │───→│  HuggingFace API │───→│  AI Detection  │
│ (Desktop/Mobile │    │      (Cloud)     │    │     Model      │
│ /Chrome/Web)    │    │                  │    │                │
└─────────────────┘    └──────────────────┘    └────────────────┘
```

### How It Works:
1. **Audio Capture**: Apps record/capture audio (3-5 seconds)
2. **Cloud Processing**: Audio sent to HuggingFace Gradio API
3. **AI Analysis**: Custom CNN analyzes mel-spectrograms
4. **Real-time Results**: Instant detection with confidence scores
5. **Smart Alerts**: Notifications for suspicious audio

## 🚀 Quick Start

### 1. Test the Web Demo
Visit: [https://huggingface.co/spaces/pauliano22/deepfake-audio-detector](https://huggingface.co/spaces/pauliano22/deepfake-audio-detector)

### 2. Run Desktop App
```bash
# Install dependencies
pip install kivy kivymd requests plyer pystray pillow pyaudio

# Run desktop monitor
python deepfake_monitor.py
# Look for red icon in system tray → Right-click → Start Monitoring
```

### 3. Run Mobile App (Desktop Preview)
```bash
# Install mobile dependencies  
pip install kivy kivymd requests plyer

# Run mobile app
python mobile_deepfake_app.py
# Test recording and file upload features
```

### 4. Chrome Extension
```bash
# Run local server (if needed for advanced features)
pip install flask flask-cors requests
python chrome_extension_server.py

# Install extension:
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Load Unpacked → select chrome_extension/ folder
```

## 📁 Project Structure

```
deepfake-detector/
├── 🔧 Core Components
│   ├── hf_api_client.py              # HuggingFace API client (IMPORTANT!)
│   ├── deepfake_detector.py          # Original model training script
│   └── config_manager.py             # Configuration management
│
├── 🖥️ Desktop Application
│   ├── deepfake_monitor.py           # System tray background monitor
│   └── requirements_desktop.txt      # Desktop dependencies
│
├── 📱 Mobile Application  
│   ├── mobile_deepfake_app.py        # Kivy/KivyMD mobile app
│   ├── buildozer.spec               # Android build configuration
│   └── requirements_mobile.txt       # Mobile dependencies
│
├── 🌐 Chrome Extension
│   ├── chrome_extension_server.py    # Optional local server
│   └── chrome_extension/             # Extension files
│       ├── manifest.json
│       ├── popup.html
│       ├── popup.js
│       ├── content.js
│       └── background.js
│
├── 🌐 Web Demo
│   └── audio_tester.jsx             # Next.js React component
│
└── 📊 Data & Models
    ├── models/                       # Local model files (optional)
    ├── data/                        # Training data
    └── logs/                        # Detection logs
```

## 🔄 How the API System Works

### Central API Client (`hf_api_client.py`)
All apps use this unified client to connect to HuggingFace:

```python
from hf_api_client import HuggingFaceDeepfakeAPI

# Initialize API client
api = HuggingFaceDeepfakeAPI()

# Detect deepfake from file
result = api.detect_deepfake("audio.wav")

# Detect from audio bytes  
result = api.detect_deepfake_from_bytes(audio_bytes)

# Result format:
{
    'prediction': 'FAKE' or 'REAL',
    'confidence': 0.85,  # 85% confidence
    'probabilities': {'real': 0.15, 'fake': 0.85},
    'is_suspicious': True
}
```

### API Flow:
1. **Upload**: Audio file → HuggingFace `/upload` endpoint
2. **Predict**: File path → `/call/predict` endpoint  
3. **Poll**: Event ID → `/call/predict/{event_id}` for results
4. **Parse**: Markdown response → Structured JSON

### Configuration Management:
```python
# Auto-updating model endpoints
{
    "model_endpoint": "https://your-model.hf.space",
    "model_version": "2.0",
    "fallback_endpoints": ["backup1.hf.space", "backup2.hf.space"],
    "auto_update": true
}
```

## 🧪 Testing Each Component

### Desktop App Test:
```bash
python deepfake_monitor.py
# ✅ System tray icon appears
# ✅ Right-click menu works  
# ✅ "Start Monitoring" begins audio capture
# ✅ Test alerts with test function
```

### Mobile App Test:
```bash
python mobile_deepfake_app.py
# ✅ Material Design window opens
# ✅ Record button works (5-second recording)
# ✅ File upload opens file picker
# ✅ Results display with confidence scores
```

### Chrome Extension Test:
```bash
# 1. Load extension in Chrome
# 2. Visit any website with audio
# 3. Click extension icon
# 4. Enable monitoring
# ✅ Popup shows controls
# ✅ Audio detection works
# ✅ Alerts appear for suspicious audio
```

### Web Demo Test:
- Upload audio file → See instant results
- Works with MP3, WAV, M4A files
- Shows confidence breakdown

## 📦 Building for Distribution

### Desktop Executable:
```bash
pip install pyinstaller
pyinstaller --onefile --windowed deepfake_monitor.py
# Output: dist/deepfake_monitor.exe
```

### Android APK:
```bash
pip install buildozer
buildozer android debug
# Output: bin/deepfakedetector-1.0-debug.apk
```

### Chrome Extension Package:
```bash
zip -r deepfake-detector-extension.zip chrome_extension/
# Upload to Chrome Web Store
```

## 🚀 Publishing Guide

### Chrome Web Store:
1. Developer account ($5 fee)
2. Upload extension ZIP
3. 1-3 day review process

### Google Play Store:
1. Developer account ($25 fee)
2. Upload signed APK
3. 1-3 day review process

### Desktop Distribution:
- **GitHub Releases**: Free hosting
- **Microsoft Store**: Windows distribution
- **Mac App Store**: macOS distribution

## ⚙️ Configuration & Updates

### Auto-Update System:
Apps automatically check for new model versions and update endpoints:

```json
{
  "model_endpoint": "https://new-improved-model.hf.space",
  "model_version": "2.1",
  "changelog": [
    "15% better accuracy",
    "Faster processing",
    "New language support"
  ]
}
```

### Fallback System:
If primary API fails, apps automatically try backup endpoints:
- Primary: `your-model.hf.space`
- Backup 1: `backup-model-1.hf.space`  
- Backup 2: `backup-model-2.hf.space`

## 🔧 Dependencies

### Core (All Apps):
```bash
pip install requests  # API calls
```

### Desktop App:
```bash
pip install pystray pillow pyaudio  # System tray, audio
```

### Mobile App:
```bash
pip install kivy kivymd plyer  # UI framework, platform features
```

### Chrome Extension:
```bash
pip install flask flask-cors  # Optional local server
```

## 🐛 Troubleshooting

### Common Issues:

**"No module named 'hf_api_client'"**
```bash
# Make sure h