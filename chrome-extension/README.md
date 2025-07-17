# 🌐 AI Voice Detector - Chrome Extension

Real-time deepfake voice detection for web audio.

## 🚀 Quick Setup

### 1. Start Python Server
```bash
# Install dependencies
pip install -r requirements.txt

# Start server
python chrome_extension_server.py
```
**Expected:** Server runs on http://localhost:8765

### 2. Install Chrome Extension
```bash
# 1. Open Chrome and go to: chrome://extensions/
# 2. Enable "Developer mode" (top right toggle)
# 3. Click "Load unpacked"
# 4. Select the "extension" folder
```
**Expected:** Extension icon appears in Chrome toolbar

### 3. Test It
```bash
# 1. Click extension icon in toolbar
# 2. Click "Start Monitoring" 
# 3. Allow microphone access
# 4. Click "Test Detection" to verify
```

## ✨ Features

- **🎙️ Real-time Monitoring**: Captures web audio every 5 seconds
- **🤖 AI Detection**: Uses HuggingFace API for analysis  
- **🚨 Smart Alerts**: Visual alerts for suspicious audio
- **📊 Detection History**: Tracks all detections with confidence scores
- **🧪 Test Mode**: Test functionality without real audio

## 📁 File Structure

```
chrome-extension/
├── chrome_extension_server.py    # Python server
├── hf_api_client.py              # HuggingFace API client
├── requirements.txt              # Python dependencies
├── extension/                    # Chrome extension files
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── content.js
│   ├── background.js
│   ├── icon16.png               # Need to add
│   ├── icon48.png               # Need to add
│   └── icon128.png              # Need to add
└── README.md
```

## 🔧 How It Works

1. **Chrome Extension** captures microphone audio
2. **Content Script** processes 5-second audio chunks
3. **Python Server** receives audio via Flask API
4. **HuggingFace API** analyzes audio for deepfakes
5. **Results** show in extension popup with alerts

## 🛠️ Troubleshooting

### Server Issues:
```bash
# Server won't start
pip install flask flask-cors requests

# Port already in use
python chrome_extension_server.py  # Try different port
```

### Extension Issues:
```bash
# Extension won't load
# Check manifest.json for errors
# Reload extension in chrome://extensions/

# Microphone access denied
# Click extension icon → Allow microphone when prompted
```

### Detection Issues:
```bash
# No detections appearing
# 1. Check if server is running (green status in popup)
# 2. Test with "Test Detection" button
# 3. Ensure microphone is working
```

## 📦 Publishing to Chrome Web Store

### 1. Prepare Package
```bash
# Add icon files (16x16, 48x48, 128x128 pixels)
# Test thoroughly
# Zip the extension folder
zip -r ai-voice-detector.zip extension/
```

### 2. Chrome Web Store
- Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
- Pay $5 one-time developer fee
- Upload ZIP file
- Fill store listing (description, screenshots, etc.)
- Submit for review (1-3 days)

### 3. Store Listing Requirements
- **Title**: "AI Voice Detector"
- **Description**: 132+ characters about deepfake detection
- **Screenshots**: 1280x800 pixels showing extension in use
- **Privacy Policy**: Required for microphone permissions
- **Category**: Productivity or Security

## 🔐 Privacy & Permissions

- **Microphone**: Required to capture audio for analysis
- **Storage**: Saves detection history locally
- **Notifications**: Shows alerts for deepfakes
- **activeTab**: Reads current website URL

**Privacy Note**: Audio is sent to HuggingFace for analysis. No audio is stored permanently.

## 🎯 Usage Tips

- **Works best on**: Video calls, podcasts, news sites
- **Rate limiting**: Analyzes every 10 seconds to avoid spam
- **Volume threshold**: Skips very quiet audio automatically
- **Background operation**: Continues monitoring while browsing

## ⚠️ Limitations

- Requires microphone permissions
- Needs Python server running locally
- 5-second audio chunks (not real-time)
- May not work on all websites due to audio access restrictions