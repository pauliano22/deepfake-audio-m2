[app]
title = AI Voice Detector
package.name = aivoicedetector
package.domain = com.yourname.aivoicedetector

source.dir = .
source.include_exts = py,png,jpg,kv,atlas,json

version = 1.0
requirements = python3,kivy==2.1.0,kivymd,requests,plyer

# Permissions
android.permissions = RECORD_AUDIO,READ_EXTERNAL_STORAGE,WRITE_EXTERNAL_STORAGE,INTERNET,VIBRATE

[buildozer]
log_level = 2

[android]
# Full package name
fullname = AI Voice Detector

# Icon
#icon.filename = %(source.dir)s/icon.png

# Launcher icon
#presplash.filename = %(source.dir)s/presplash.png

# Android API level
android.api = 31
android.minapi = 21

# NDK version
android.ndk = 25b

# SDK directory
#android.sdk_path = 

# NDK directory  
#android.ndk_path =

# Accept SDK license
android.accept_sdk_license = True