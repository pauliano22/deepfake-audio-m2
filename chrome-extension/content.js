// content.js - Updated with Lion Project styling
if (window.aiVoiceDetectorInjected) {
    console.log('🔄 AI Voice Detector already injected, skipping...');
    throw new Error('Already injected');
} else {
    window.aiVoiceDetectorInjected = true;
    console.log('🎤 AI Voice Detector - Lion Project Styled');

    let isMonitoring = false;
    let audioContext;
    let mediaStream = null;
    let audioWorkletNode = null;
    let scriptProcessor = null;
    let streamingInterval = null;
    
    // Detect Mac/Safari
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    console.log(`🖥️ Platform detected: ${isMac ? 'Mac' : 'Windows/Linux'}, Safari: ${isSafari}`);
    
    // Global state management
    if (!window.aiVoiceDetectorGlobalState) {
        window.aiVoiceDetectorGlobalState = {
            screenShareRequested: false,
            screenShareInProgress: false,
            requestTimestamp: 0
        };
    }
    
    const globalState = window.aiVoiceDetectorGlobalState;

    // Mac-compatible streaming parameters
    const STREAM_INTERVAL = isMac ? 750 : 500;
    const MIN_VOLUME_THRESHOLD = isMac ? 0.0005 : 0.001;
    
    // Anti-spam controls
    let lastAlertTime = 0;
    const ALERT_COOLDOWN = 2000;
    let recentDetections = [];
    const DETECTION_WINDOW = 2000;
    let activeAlert = null;

    // Streaming audio buffer
    let streamingBuffer = [];
    let bufferDuration = 0;
    
    // Performance tracking
    let totalDetections = 0;
    let detectionLatency = [];

    const HF_API_URL = 'https://pauliano22-deepfake-audio-detector.hf.space/gradio_api';

    // Inject custom styles once
    function injectLionProjectStyles() {
        const oldStyle = document.getElementById('lion-project-styles');
        if (oldStyle) oldStyle.remove();
        
        const style = document.createElement('style');
        style.id = 'lion-project-styles';
        if (document.getElementById('lion-project-styles')) return;
        
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap');
            
            .lion-notification {
                position: fixed;
                top: 24px;
                padding: 16px 24px;
                left: 24px;
                background: linear-gradient(135deg, #DC2626 0%, #ff4444 100%);
                color: white;
                border-radius: 16px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                font-weight: 300;
                z-index: 999999;
                box-shadow: 0 12px 40px rgba(220, 38, 38, 0.4);
                max-width: 250px;
                border: 1px solid rgba(255, 107, 53, 0.4);
                backdrop-filter: blur(20px);
                animation: lionAlertSlide 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .lion-notification-title {
                font-size: 18px;
                font-weight: 400;
                display: flex;
                align-items: center;
                letter-spacing: 0.5px;
            }
            
            .lion-notification-body {
                font-size: 14px;
                opacity: 0.95;
                line-height: 1.5;
                font-weight: 300;
                white-space: pre-line;
            }
            
            .lion-alert {
                position: fixed;
                top: 24px;
                right: 24px;
                background: linear-gradient(135deg, #DC2626 0%, #ff4444 100%);
                color: white;
                padding: 20px 24px;
                border-radius: 16px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                font-weight: 300;
                z-index: 999999;
                box-shadow: 0 12px 40px rgba(220, 38, 38, 0.4);
                max-width: 340px;
                border: 1px solid rgba(255, 107, 53, 0.4);
                backdrop-filter: blur(20px);
                animation: lionAlertSlide 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .lion-alert-title {
                font-size: 18px;
                font-weight: 400;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
                letter-spacing: 0.5px;
            }
            
            .lion-alert-body {
                font-size: 14px;
                margin-bottom: 16px;
                opacity: 0.95;
                line-height: 1.5;
                font-weight: 300;
            }
            
            .lion-alert-button {
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 10px 18px;
                border-radius: 10px;
                cursor: pointer;
                font-weight: 400;
                font-size: 13px;
                transition: all 0.3s ease;
                font-family: inherit;
                letter-spacing: 0.5px;
                backdrop-filter: blur(10px);
            }
            
            .lion-alert-button:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateY(-1px);
                box-shadow: 0 4px 16px rgba(255, 255, 255, 0.2);
            }
            
            .lion-alert-icon {
                width: 20px;
                height: 20px;
                stroke: currentColor;
                stroke-width: 2;
                fill: none;
                filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
            }
            
            @keyframes lionSlideIn {
                from {
                    transform: translateX(-100%) scale(0.9);
                    opacity: 0;
                }
                to {
                    transform: translateX(0) scale(1);
                    opacity: 1;
                }
            }
            
            @keyframes lionAlertSlide {
                from {
                    transform: translateX(100%) scale(0.9);
                    opacity: 0;
                }
                to {
                    transform: translateX(0) scale(1);
                    opacity: 1;
                }
            }
            
            @keyframes lionPulse {
                0%, 100% {
                    box-shadow: 0 12px 40px rgba(220, 38, 38, 0.4);
                }
                50% {
                    box-shadow: 0 16px 50px rgba(220, 38, 38, 0.6);
                }
            }
            
            .lion-alert.pulse {
                animation: lionAlertSlide 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), 
                          lionPulse 2s ease-in-out infinite 0.5s;
            }
        `;
        document.head.appendChild(style);
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('📨 Message received:', request);
        
        if (request.action === 'startMonitoring') {
            console.log('🖥️ Starting Lion Project styled monitoring...');
            
            startRealTimeStreaming()
                .then(() => {
                    console.log('✅ Lion Project monitoring started');
                    sendResponse({ success: true, isMonitoring: true });
                })
                .catch(error => {
                    console.error('❌ Lion Project monitoring failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;
            
        } else if (request.action === 'stopMonitoring') {
            stopRealTimeStreaming();
            sendResponse({ success: true, isMonitoring: false });
            
        } else if (request.action === 'getMonitoringState') {
            sendResponse({ isMonitoring });
        }
        
        return true;
    });

    async function startRealTimeStreaming() {
        if (isMonitoring) {
            console.log('⚠️ Already monitoring');
            return;
        }

        const now = Date.now();
        
        if (globalState.screenShareRequested || globalState.screenShareInProgress) {
            console.log('⚠️ Screen share blocked - already in progress');
            throw new Error('Screen sharing request already in progress.');
        }
        
        if (now - globalState.requestTimestamp < 5000) {
            console.log('⚠️ Screen share blocked - too recent');
            throw new Error('Please wait a moment before requesting screen share again.');
        }

        console.log('🖥️ Starting Lion Project audio streaming...');
        globalState.screenShareRequested = true;
        globalState.screenShareInProgress = true;
        globalState.requestTimestamp = now;
        
        try {
            showLionNotification(
                'Setup Required', 
                'Click "Entire Screen"\nSelect your screen\nCheck "Share system audio"\nClick "Share"', 
                10000
            );
            
            // Mac-compatible media constraints
            const constraints = {
                video: true,
                audio: isMac ? {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    suppressLocalAudioPlayback: false
                } : {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 16000,
                    suppressLocalAudioPlayback: false
                }
            };
            
            console.log('🎤 Requesting display media with constraints:', constraints);
            mediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            
            const audioTracks = mediaStream.getAudioTracks();
            const videoTracks = mediaStream.getVideoTracks();
            
            console.log('🎥 Lion Project capture setup:', {
                audio: audioTracks.length,
                video: videoTracks.length,
                audioSettings: audioTracks[0]?.getSettings(),
                platform: isMac ? 'Mac' : 'Windows/Linux'
            });
            
            if (audioTracks.length === 0) {
                videoTracks.forEach(track => track.stop());
                throw new Error(isMac ? 
                    'No system audio detected! On Mac, make sure to check "Share system audio" in the permission dialog.' :
                    'No system audio detected! You must check "Also share system audio".');
            }
            
            // Stop video tracks to save resources
            videoTracks.forEach(track => {
                console.log('⏹️ Stopping video track to save resources');
                track.stop();
            });
            
            // Setup Mac-compatible audio processing
            await setupMacCompatibleAudioProcessing();
            
            // Start streaming interval
            startStreamingInterval();
            
            // Handle stream ending
            audioTracks[0].addEventListener('ended', () => {
                console.log('🔚 Screen sharing ended by user');
                stopRealTimeStreaming();
            });
            
            isMonitoring = true;
            globalState.screenShareInProgress = false;
            console.log('✅ Lion Project streaming active');
            showLionNotification('Detection Active', 'Monitoring for AI voices...', 3000);
            
        } catch (error) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
            
            console.error('❌ Lion Project streaming error:', error);
            
            if (error.name === 'NotAllowedError') {
                throw new Error(isMac ? 
                    'Permission denied. On Mac, please allow screen sharing and check "Share system audio".' :
                    'Permission denied. Please allow screen sharing and check "Also share system audio".');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('Screen sharing not supported in this browser.');
            } else if (error.name === 'AbortError') {
                throw new Error(isMac ?
                    'Screen sharing cancelled. On Mac, make sure to check "Share system audio".' :
                    'Screen sharing cancelled. Make sure to check "Also share system audio".');
            } else {
                throw new Error(`Streaming failed: ${error.message}`);
            }
        }
    }

    async function setupMacCompatibleAudioProcessing() {
        try {
            if (isMac) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log(`🎵 Mac audio context created with sample rate: ${audioContext.sampleRate}Hz`);
            } else {
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)({
                        sampleRate: 16000
                    });
                } catch (sampleRateError) {
                    console.log('16kHz not supported, using default sample rate');
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
            }
        } catch (error) {
            throw new Error(`Failed to create audio context: ${error.message}`);
        }
        
        const streamSource = audioContext.createMediaStreamSource(mediaStream);
        
        if (audioContext.audioWorklet && !isSafari) {
            try {
                console.log('🔧 Using AudioWorklet for audio processing');
                await setupAudioWorklet(streamSource);
            } catch (workletError) {
                console.log('AudioWorklet failed, falling back to ScriptProcessor:', workletError);
                setupScriptProcessor(streamSource);
            }
        } else {
            console.log('🔧 Using ScriptProcessor for audio processing (Mac Safari compatible)');
            setupScriptProcessor(streamSource);
        }
    }

    async function setupAudioWorklet(streamSource) {
        const workletCode = `
            class AudioProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    this.bufferSize = 1024;
                    this.buffer = new Float32Array(this.bufferSize);
                    this.bufferIndex = 0;
                }
                
                process(inputs, outputs, parameters) {
                    const input = inputs[0];
                    if (input.length > 0) {
                        const inputData = input[0];
                        for (let i = 0; i < inputData.length; i++) {
                            this.buffer[this.bufferIndex] = inputData[i];
                            this.bufferIndex++;
                            
                            if (this.bufferIndex >= this.bufferSize) {
                                this.port.postMessage({
                                    type: 'audioData',
                                    data: new Float32Array(this.buffer)
                                });
                                this.bufferIndex = 0;
                            }
                        }
                    }
                    return true;
                }
            }
            registerProcessor('audio-processor', AudioProcessor);
        `;
        
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        
        await audioContext.audioWorklet.addModule(workletUrl);
        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        
        audioWorkletNode.port.onmessage = (event) => {
            if (event.data.type === 'audioData' && isMonitoring) {
                processAudioData(event.data.data);
            }
        };
        
        streamSource.connect(audioWorkletNode);
        URL.revokeObjectURL(workletUrl);
    }

    function setupScriptProcessor(streamSource) {
        const bufferSize = isMac ? 2048 : 1024;
        scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        let lastVolumeLog = 0;
        
        scriptProcessor.onaudioprocess = (event) => {
            if (!isMonitoring) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            processAudioData(inputData);
            
            const now = Date.now();
            if (now - lastVolumeLog > 10000) {
                const volume = calculateRMS(inputData);
                console.log(`🔊 ${isMac ? 'Mac' : 'PC'} audio volume: ${volume.toFixed(6)}`);
                lastVolumeLog = now;
            }
        };
        
        streamSource.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
    }

    function processAudioData(inputData) {
        streamingBuffer.push(new Float32Array(inputData));
        bufferDuration += inputData.length / audioContext.sampleRate;
        
        while (bufferDuration > 2.0) {
            const removedChunk = streamingBuffer.shift();
            if (removedChunk) {
                bufferDuration -= removedChunk.length / audioContext.sampleRate;
            }
        }
    }

    function startStreamingInterval() {
        let chunkCount = 0;
        
        streamingInterval = setInterval(() => {
            if (!isMonitoring || streamingBuffer.length === 0) return;
            
            const currentVolume = streamingBuffer.length > 0 ? 
                calculateRMS(streamingBuffer[streamingBuffer.length - 1]) : 0;
            
            if (currentVolume < MIN_VOLUME_THRESHOLD) {
                console.log(`🔇 ${isMac ? 'Mac' : 'PC'} audio too quiet, skipping stream (${currentVolume.toFixed(6)})`);
                return;
            }
            
            const bufferCopy = [...streamingBuffer];
            const duration = bufferDuration;
            
            if (duration < 0.5) {
                console.log(`⏳ Insufficient audio (${duration.toFixed(1)}s), waiting...`);
                return;
            }
            
            chunkCount++;
            console.log(`🎵 ${isMac ? 'Mac' : 'PC'} streaming chunk #${chunkCount} (${duration.toFixed(1)}s, volume: ${currentVolume.toFixed(6)})`);
            
            processStreamingChunk(bufferCopy, chunkCount);
            
            const overlapDuration = 0.5;
            let samplesToRemove = 0;
            let removedDuration = 0;
            
            for (let i = 0; i < streamingBuffer.length; i++) {
                const chunkSamples = streamingBuffer[i].length;
                const chunkDuration = chunkSamples / audioContext.sampleRate;
                
                if (removedDuration + chunkDuration < duration - overlapDuration) {
                    samplesToRemove += chunkSamples;
                    removedDuration += chunkDuration;
                } else {
                    break;
                }
            }
            
            let removedSamples = 0;
            while (removedSamples < samplesToRemove && streamingBuffer.length > 0) {
                const chunk = streamingBuffer.shift();
                if (chunk) {
                    removedSamples += chunk.length;
                    bufferDuration -= chunk.length / audioContext.sampleRate;
                }
            }
            
        }, STREAM_INTERVAL);
    }

    async function processStreamingChunk(audioBuffer, chunkId) {
        const startTime = Date.now();
        
        try {
            const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Float32Array(totalLength);
            
            let offset = 0;
            for (const chunk of audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }
            
            const wavBlob = createMacCompatibleWAVBlob(combinedBuffer, audioContext.sampleRate);
            console.log(`📦 ${isMac ? 'Mac' : 'PC'} streaming analysis #${chunkId}: ${wavBlob.size} bytes at ${audioContext.sampleRate}Hz`);
            
            const result = await sendToStreamingAPI(wavBlob);
            
            if (result && !result.error) {
                const latency = Date.now() - startTime;
                detectionLatency.push(latency);
                
                console.log(`🎯 ${isMac ? 'Mac' : 'PC'} streaming result #${chunkId}:`, result, `(${latency}ms)`);
                
                result.source = `Real-Time Stream (${isMac ? 'Mac' : 'PC'})`;
                result.chunkId = chunkId;
                result.latency = latency;
                result.sampleRate = audioContext.sampleRate;
                
                handleStreamingResult(result);
            } else {
                console.error(`❌ Streaming API error #${chunkId}:`, result?.error);
            }
            
        } catch (error) {
            console.error(`❌ Streaming analysis failed #${chunkId}:`, error);
        }
    }

    function createMacCompatibleWAVBlob(audioBuffer, sampleRate) {
        const pcmBuffer = new Int16Array(audioBuffer.length);
        for (let i = 0; i < audioBuffer.length; i++) {
            pcmBuffer[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32767));
        }
        
        const buffer = new ArrayBuffer(44 + pcmBuffer.length * 2);
        const view = new DataView(buffer);
        
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
        
        for (let i = 0; i < pcmBuffer.length; i++) {
            view.setInt16(44 + i * 2, pcmBuffer[i], true);
        }
        
        return new Blob([buffer], { type: 'audio/wav' });
    }

    async function sendToStreamingAPI(audioBlob) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), isMac ? 15000 : 10000);
        
        try {
            const formData = new FormData();
            formData.append('files', audioBlob, 'stream.wav');
            
            const uploadResponse = await fetch(`${HF_API_URL}/upload`, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });
            
            if (!uploadResponse.ok) {
                throw new Error(`Upload failed: ${uploadResponse.status}`);
            }
            
            const uploadResult = await uploadResponse.json();
            const filePath = uploadResult[0];
            
            const predictionResponse = await fetch(`${HF_API_URL}/call/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: [{
                        path: filePath,
                        meta: { _type: "gradio.FileData" }
                    }]
                }),
                signal: controller.signal
            });
            
            if (!predictionResponse.ok) {
                throw new Error(`Prediction failed: ${predictionResponse.status}`);
            }
            
            const predictionResult = await predictionResponse.json();
            const rawResult = await pollStreamingResults(predictionResult.event_id, controller.signal);
            
            return parseStreamingResult(rawResult);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                return { error: 'Stream timeout' };
            }
            return { error: error.message };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function pollStreamingResults(eventId, signal) {
        const maxAttempts = isMac ? 15 : 10;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await fetch(`${HF_API_URL}/call/predict/${eventId}`, { signal });
                
                if (!response.ok) {
                    await new Promise(resolve => setTimeout(resolve, isMac ? 300 : 200));
                    continue;
                }
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                
                                if (Array.isArray(data) && data.length > 0) {
                                    return data[0];
                                }
                                
                                if (data.msg === 'process_completed' && data.output) {
                                    return data.output.data[0];
                                }
                                
                            } catch (parseError) {
                                continue;
                            }
                        }
                    }
                }
                
            } catch (error) {
                if (error.name === 'AbortError') throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, isMac ? 400 : 300));
        }
        
        throw new Error('Streaming poll timeout');
    }

    function parseStreamingResult(markdownResult) {
        try {
            const realMatch = markdownResult.match(/Real Voice.*?(\d+\.\d+)%/i);
            const fakeMatch = markdownResult.match(/AI Generated.*?(\d+\.\d+)%/i);
            
            const realProb = realMatch ? parseFloat(realMatch[1]) / 100 : 0.5;
            const fakeProb = fakeMatch ? parseFloat(fakeMatch[1]) / 100 : 0.5;
            
            const isFake = fakeProb > realProb || markdownResult.includes('LIKELY AI GENERATED');
            
            return {
                prediction: isFake ? 'FAKE' : 'REAL',
                confidence: Math.max(realProb, fakeProb),
                probabilities: { real: realProb, fake: fakeProb },
                is_suspicious: fakeProb > 0.6,
                raw_result: markdownResult,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                platform: isMac ? 'Mac' : 'Windows/Linux'
            };
            
        } catch (error) {
            console.error('❌ Streaming result parsing error:', error);
            return {
                prediction: 'UNKNOWN',
                confidence: 0.5,
                error: error.message,
                platform: isMac ? 'Mac' : 'Windows/Linux'
            };
        }
    }

    function handleStreamingResult(result) {
        totalDetections++;
        console.log(`🎯 Processing ${isMac ? 'Mac' : 'PC'} streaming result #${totalDetections}:`, result);
        
        const now = Date.now();
        const resultKey = `${result.prediction}-${Math.round(result.confidence * 20)}`;
        
        recentDetections = recentDetections.filter(det => now - det.time < DETECTION_WINDOW);
        
        const isDuplicate = recentDetections.some(det => 
            det.key === resultKey && (now - det.time < 1000)
        );
        
        if (isDuplicate) {
            console.log('🔄 Duplicate streaming detection ignored:', resultKey);
            return;
        }
        
        recentDetections.push({ key: resultKey, time: now });
        
        // Store detection
        try {
            chrome.storage.local.get(['detections'], (data) => {
                const detections = data.detections || [];
                detections.push(result);
                
                if (detections.length > 150) {
                    detections.splice(0, detections.length - 150);
                }
                
                chrome.storage.local.set({ detections });
            });
        } catch (error) {
            console.log('⚠️ Could not store detection:', error.message);
        }
        
        // Show real-time alert
        if (result.is_suspicious && shouldShowStreamingAlert()) {
            showLionDeepfakeAlert(result);
            lastAlertTime = now;
        }
        
        // Send to popup
        try {
            chrome.runtime.sendMessage({
                type: 'streamingDetectionResult',
                result: result,
                totalDetections: totalDetections,
                averageLatency: detectionLatency.slice(-10).reduce((a, b) => a + b, 0) / Math.min(detectionLatency.length, 10)
            }).catch(() => {});
        } catch (error) {
            console.log('⚠️ Could not send streaming message:', error.message);
        }
    }

    function shouldShowStreamingAlert() {
        const now = Date.now();
        return now - lastAlertTime >= ALERT_COOLDOWN && !activeAlert;
    }

    function showLionDeepfakeAlert(result) {
        console.log(`🚨 LION PROJECT DEEPFAKE DETECTED ON ${isMac ? 'MAC' : 'PC'}!`);
        
        // Inject styles first
        injectLionProjectStyles();
        
        if (activeAlert) {
            activeAlert.remove();
        }
        
        const alert = document.createElement('div');
        activeAlert = alert;
        alert.className = 'lion-alert pulse';
        
        alert.innerHTML = `
            <div class="lion-alert-title">
                <svg class="lion-alert-icon" viewBox="0 0 24 24">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                    <path d="M12 9v4"/>
                    <path d="m12 17 .01 0"/>
                </svg>
                AI Detected
            </div>
            <div class="lion-alert-body">
                Confidence: ${(result.confidence * 100).toFixed(1)}
            </div>
            <button class="lion-alert-button" id="dismissLionAlert">
                Dismiss
            </button>
        `;
        
        const dismissBtn = alert.querySelector('#dismissLionAlert');
        dismissBtn.addEventListener('click', () => {
            if (alert.parentElement) {
                alert.remove();
                activeAlert = null;
            }
        });
        
        document.body.appendChild(alert);
        
        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
                if (activeAlert === alert) {
                    activeAlert = null;
                }
            }
        }, 8000);
    }

    function stopRealTimeStreaming() {
        if (!isMonitoring) return;
        
        console.log(`⏹️ Stopping ${isMac ? 'Mac' : 'PC'} Lion Project streaming...`);
        
        // Clear streaming interval
        if (streamingInterval) {
            clearInterval(streamingInterval);
            streamingInterval = null;
        }
        
        // Clear buffers
        streamingBuffer = [];
        bufferDuration = 0;
        
        // Clear detection data
        lastAlertTime = 0;
        recentDetections = [];
        if (activeAlert) {
            activeAlert.remove();
            activeAlert = null;
        }
        
        // Stop audio processing
        if (audioWorkletNode) {
            try {
                audioWorkletNode.disconnect();
            } catch (e) {}
            audioWorkletNode = null;
        }
        
        if (scriptProcessor) {
            try {
                scriptProcessor.disconnect();
            } catch (e) {}
            scriptProcessor = null;
        }
        
        // Stop media stream
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => {
                console.log(`⏹️ Stopping ${isMac ? 'Mac' : 'PC'} streaming track:`, track.label);
                track.stop();
            });
            mediaStream = null;
        }
        
        // Close audio context
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
            audioContext = null;
        }
        
        // Reset state
        isMonitoring = false;
        if (globalState) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
        }
        
        console.log(`✅ ${isMac ? 'Mac' : 'PC'} Lion Project streaming stopped`);
        console.log(`📊 Session stats: ${totalDetections} detections, avg latency: ${detectionLatency.length ? (detectionLatency.reduce((a, b) => a + b, 0) / detectionLatency.length).toFixed(0) : 'N/A'}ms`);
        
        // Reset counters
        totalDetections = 0;
        detectionLatency = [];
        
        showLionNotification('Detection Stopped', 'Monitoring stopped', 2000);
    }

    function calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }

    function showLionNotification(title, message, duration = 3000) {
        // Inject styles first
        injectLionProjectStyles();
        
        const notification = document.createElement('div');
        notification.className = 'lion-notification';
        notification.innerHTML = `
            <div class="lion-notification-title">
               ${title}
            </div>   
            <div class="lion-notification-body">
                ${message}
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, duration);
    }

    // Cleanup function
    window.aiVoiceDetectorCleanup = function() {
        stopRealTimeStreaming();
        if (globalState) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
            globalState.requestTimestamp = 0;
        }
    };

    console.log(`✅ ${isMac ? 'Mac' : 'PC'}-Compatible Lion Project AI Voice Detector Ready!`);
}