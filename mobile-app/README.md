# 📱 AI Voice Detector - Mobile App

Portable deepfake voice detection for Android and iOS.

## 🚀 Quick Test (Desktop Preview)

```bash
# Install dependencies
pip install -r requirements.txt

# Run mobile app preview
python mobile_deepfake_app.py
```

**Expected Result:** Material Design window opens with record/upload buttons.

## 📦 Build Android APK

```bash
# Install buildozer
pip install buildozer

# First build (takes 30+ minutes)
buildozer android debug

# Output: bin/aivoicedetector-1.0-debug.apk
```

## 📲 Install on Android

```bash
# Enable USB debugging on your phone
# Connect phone via USB

# Install APK
buildozer android deploy

# Or manually install:
adb install bin/aivoicedetector-1.0-debug.apk
```

## ✨ Features

- **🎙️ Record Audio**: 5-second voice recording
- **📁 File Upload**: Analyze existing audio files  
- **🤖 AI Detection**: Uses HuggingFace API for analysis
- **📊 Results Display**: Shows confidence scores
- **🚨 Alerts**: Vibration and popup for deepfakes
- **📱 Material Design**: Modern Android UI

## 🛠️ Troubleshooting

### Desktop Preview Issues:
```bash
# Missing kivy/kivymd
pip install kivy==2.1.0 kivymd==1.1.1

# Audio recording fails
pip install pyaudio
```

### Android Build Issues:
```bash
# Buildozer fails
buildozer android clean
buildozer android debug

# SDK issues
buildozer android update
```

### App Crashes on Phone:
- Check Android version (minimum API 21)
- Grant microphone permissions
- Ensure internet connection

## 📋 File Structure

```
mobile-app/
├── mobile_deepfake_app.py    # Main app
├── hf_api_client.py          # API client
├── requirements.txt          # Dependencies
├── buildozer.spec           # Android build config
└── README.md               # This file
```

## 🔄 How It Works

1. **Record/Upload** → Audio captured
2. **API Call** → Sent to HuggingFace model
3. **Analysis** → AI processes mel-spectrograms  
4. **Results** → Shows REAL/FAKE with confidence
5. **Alerts** → Notifications for suspicious audio