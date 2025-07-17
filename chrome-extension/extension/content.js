// content.js - FIXED Chrome Extension Content Script
let isMonitoring = false;
let audioContext;
let mediaStream;
let scriptProcessor;

const SERVER_URL = 'http://localhost:8765';

console.log('🎤 AI Voice Detector content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Content script received message:', request);
    
    switch (request.action) {
        case 'startMonitoring':
            startAudioMonitoring()
                .then(() => {
                    console.log('✅ Monitoring started successfully');
                    sendResponse({ success: true, isMonitoring: true });
                })
                .catch(error => {
                    console.error('❌ Failed to start monitoring:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // Keep message channel open for async response
            
        case 'stopMonitoring':
            stopAudioMonitoring();
            sendResponse({ success: true, isMonitoring: false });
            break;
            
        case 'getMonitoringState':
            sendResponse({ isMonitoring });
            break;
    }
    
    return true; // Keep message channel open
});

async function startAudioMonitoring() {
    if (isMonitoring) {
        console.log('⚠️ Already monitoring');
        return;
    }
    
    try {
        console.log('🎙️ Requesting microphone access...');
        
        // Request microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 22050
            }
        });
        
        console.log('✅ Microphone access granted');
        
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 22050
        });
        
        // Create source and processor
        const source = audioContext.createMediaStreamSource(mediaStream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        let audioBuffer = [];
        let bufferDuration = 0;
        const targetDuration = 5; // 5 seconds
        let lastAnalysisTime = 0;
        
        scriptProcessor.onaudioprocess = (event) => {
            if (!isMonitoring) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // Collect audio data
            audioBuffer.push(new Float32Array(inputData));
            bufferDuration += inputBuffer.duration;
            
            // When we have enough audio, analyze it
            if (bufferDuration >= targetDuration) {
                const now = Date.now();
                
                // Rate limit: only analyze every 15 seconds
                if (now - lastAnalysisTime > 15000) {
                    console.log('🔄 Processing 5-second audio chunk...');
                    analyzeAudioBuffer([...audioBuffer]); // Copy array
                    lastAnalysisTime = now;
                }
                
                // Reset buffer
                audioBuffer = [];
                bufferDuration = 0;
            }
        };
        
        // Connect audio nodes
        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
        
        isMonitoring = true;
        console.log('✅ Audio monitoring started successfully');
        
        // Show page notification
        showPageNotification('🎤 AI Voice Detector Active', 'Monitoring audio for deepfakes...');
        
    } catch (error) {
        console.error('❌ Failed to start audio monitoring:', error);
        
        if (error.name === 'NotAllowedError') {
            showPageNotification('🚫 Microphone Access Denied', 'Please allow microphone access to monitor audio.');
        } else {
            showPageNotification('❌ Monitoring Failed', error.message);
        }
        
        throw error;
    }
}

function stopAudioMonitoring() {
    if (!isMonitoring) return;
    
    console.log('⏹️ Stopping audio monitoring...');
    
    // Clean up audio processing
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
    
    // Stop media stream
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    isMonitoring = false;
    console.log('✅ Audio monitoring stopped');
    
    showPageNotification('⏹️ Monitoring Stopped', 'Audio detection paused.');
}

async function analyzeAudioBuffer(audioBuffer) {
    try {
        // Combine audio chunks
        const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
        const combinedBuffer = new Float32Array(totalLength);
        
        let offset = 0;
        for (const chunk of audioBuffer) {
            combinedBuffer.set(chunk, offset);
            offset += chunk.length;
        }
        
        // Check if audio has sufficient volume
        const volume = calculateRMS(combinedBuffer);
        console.log(`🔊 Audio volume: ${volume.toFixed(4)}`);
        
        if (volume < 0.001) {
            console.log('🔇 Audio too quiet, skipping analysis');
            return;
        }
        
        // Convert to WAV blob
        const wavBlob = createWAVBlob(combinedBuffer, 22050);
        console.log(`📦 Created WAV blob: ${wavBlob.size} bytes`);
        
        // Send to Python server for analysis
        await sendToServer(wavBlob);
        
    } catch (error) {
        console.error('❌ Audio analysis failed:', error);
    }
}

function calculateRMS(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
}

async function sendToServer(audioBlob) {
    try {
        console.log('📤 Sending audio to server...');
        
        // Convert blob to base64
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        // Send to Python server
        const response = await fetch(`${SERVER_URL}/api/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_data: base64Audio,
                url: window.location.href,
                source: 'Web Audio'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📥 Server response:', result);
        
        // Handle result
        if (result.error) {
            console.error('Server error:', result.error);
        } else {
            handleDetectionResult(result);
        }
        
    } catch (error) {
        console.error('❌ Failed to send audio to server:', error);
        console.error('Make sure Python server is running: python chrome_extension_server.py');
    }
}

function handleDetectionResult(result) {
    console.log('🎯 Detection result:', result);
    
    // Show alert for suspicious audio
    if (result.is_suspicious && result.prediction === 'FAKE') {
        showDeepfakeAlert(result);
    }
    
    // Send to background script for popup update
    chrome.runtime.sendMessage({
        type: 'detectionResult',
        result: result
    }).catch(error => {
        console.log('Failed to send message to background:', error);
    });
}

function createWAVBlob(audioBuffer, sampleRate) {
    // Convert Float32Array to 16-bit PCM
    const pcmBuffer = new Int16Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
        pcmBuffer[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32768));
    }
    
    // Create WAV file header
    const buffer = new ArrayBuffer(44 + pcmBuffer.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmBuffer.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcmBuffer.length * 2, true);
    
    // Write PCM data
    for (let i = 0; i < pcmBuffer.length; i++) {
        view.setInt16(44 + i * 2, pcmBuffer[i], true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
}

function showDeepfakeAlert(result) {
    // Create visual alert on page
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    
    alert.innerHTML = `
        🚨 DEEPFAKE DETECTED!<br>
        Confidence: ${(result.confidence * 100).toFixed(1)}%<br>
        <button onclick="this.parentElement.remove()" 
                style="margin-top: 10px; padding: 5px 10px; border: none; 
                       border-radius: 4px; background: white; color: black; 
                       cursor: pointer; font-weight: bold;">
            Dismiss
        </button>
    `;
    
    document.body.appendChild(alert);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 10000);
    
    // Browser notification
    chrome.runtime.sendMessage({
        type: 'showNotification',
        message: `Deepfake detected with ${(result.confidence * 100).toFixed(1)}% confidence`
    }).catch(error => {
        console.log('Notification failed:', error);
    });
}

function showPageNotification(title, message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 15px;
        border-radius: 6px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 9999;
        max-width: 250px;
    `;
    
    notification.innerHTML = `<strong>${title}</strong><br>${message}`;
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 3000);
}