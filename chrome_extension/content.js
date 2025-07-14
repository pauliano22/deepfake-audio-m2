
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
