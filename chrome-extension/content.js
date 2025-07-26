// content.js - Mac-Compatible Real-time streaming AI voice detection
if (window.aiVoiceDetectorInjected) {
    console.log('🔄 AI Voice Detector already injected, skipping...');
    throw new Error('Already injected');
} else {
    window.aiVoiceDetectorInjected = true;
    console.log('🎤 AI Voice Detector - Mac-Compatible Real-Time Streaming');

    let isMonitoring = false;
    let audioContext;
    let mediaStream = null;
    let audioWorkletNode = null;
    let scriptProcessor = null; // Fallback for older browsers
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
    const STREAM_INTERVAL = isMac ? 750 : 500; // Slower on Mac for stability
    const MIN_VOLUME_THRESHOLD = isMac ? 0.0005 : 0.001; // More sensitive on Mac
    
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

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('📨 Message received:', request);
        
        if (request.action === 'startMonitoring') {
            console.log('🖥️ Starting Mac-compatible streaming monitoring...');
            
            startRealTimeStreaming()
                .then(() => {
                    console.log('✅ Mac-compatible streaming started');
                    sendResponse({ success: true, isMonitoring: true });
                })
                .catch(error => {
                    console.error('❌ Mac-compatible streaming failed:', error);
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

        console.log('🖥️ Starting Mac-compatible audio streaming...');
        globalState.screenShareRequested = true;
        globalState.screenShareInProgress = true;
        globalState.requestTimestamp = now;
        
        try {
            showNotification(
                'Setup Required', 
                'Click "Entire Screen"\nSelect your screen\nCheck "Share system audio"\nClick "Share"', 
                8000
            );
            
            // Mac-compatible media constraints
            const constraints = {
                video: true,
                audio: isMac ? {
                    // More conservative constraints for Mac
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    suppressLocalAudioPlayback: false
                    // Don't specify sampleRate on Mac - let it use default
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
            
            console.log('🎥 Mac-compatible capture setup:', {
                audio: audioTracks.length,
                video: videoTracks.length,
                audioSettings: audioTracks[0]?.getSettings(),
                platform: isMac ? 'Mac' : 'Windows/Linux'
            });
            
            if (audioTracks.length === 0) {
                videoTracks.forEach(track => track.stop());
                throw new Error('No audio detected. Please make sure to check "Share system audio" when prompted.');
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
            console.log('✅ Mac-compatible streaming active');
            showNotification('Detection Started', 'Now monitoring for AI voices', 3000);
            
        } catch (error) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
            
            console.error('❌ Mac streaming error:', error);
            
            if (error.name === 'NotAllowedError') {
                throw new Error('Please allow screen sharing and make sure to check "Share system audio".');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('Screen sharing is not supported in this browser. Please use Chrome or Edge.');
            } else if (error.name === 'AbortError') {
                throw new Error('Screen sharing was cancelled. Please try again and click "Share".');
            } else if (error.message.includes('No system audio') || error.message.includes('No audio detected')) {
                throw new Error('No audio detected. Please make sure to check "Share system audio" when prompted.');
            } else if (error.message.includes('Failed to create audio context')) {
                throw new Error('Audio system unavailable. Please try refreshing the page.');
            } else {
                throw new Error('Unable to start detection. Please try refreshing the page.');
            }
        }
    }

    async function setupMacCompatibleAudioProcessing() {
        // Create audio context with Mac-compatible settings
        try {
            if (isMac) {
                // Let Mac use its preferred sample rate
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log(`🎵 Mac audio context created with sample rate: ${audioContext.sampleRate}Hz`);
            } else {
                // Try 16kHz for Windows, fall back to default
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
        
        // Try modern AudioWorklet first, fall back to ScriptProcessor
        if (audioContext.audioWorklet && !isSafari) {
            try {
                // Use AudioWorklet for better performance (not on Safari due to bugs)
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
        // AudioWorklet setup (for modern browsers, not Safari)
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
        // ScriptProcessor fallback (Mac Safari compatible)
        const bufferSize = isMac ? 2048 : 1024; // Larger buffer on Mac for stability
        scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        let lastVolumeLog = 0;
        
        scriptProcessor.onaudioprocess = (event) => {
            if (!isMonitoring) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            processAudioData(inputData);
            
            // Log volume periodically
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
        // Add to streaming buffer
        streamingBuffer.push(new Float32Array(inputData));
        bufferDuration += inputData.length / audioContext.sampleRate;
        
        // Keep buffer size manageable (max 2 seconds)
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
            
            // Calculate current volume
            const currentVolume = streamingBuffer.length > 0 ? 
                calculateRMS(streamingBuffer[streamingBuffer.length - 1]) : 0;
            
            // Skip if audio is too quiet
            if (currentVolume < MIN_VOLUME_THRESHOLD) {
                console.log(`🔇 ${isMac ? 'Mac' : 'PC'} audio too quiet, skipping stream (${currentVolume.toFixed(6)})`);
                return;
            }
            
            // Get current buffer state
            const bufferCopy = [...streamingBuffer];
            const duration = bufferDuration;
            
            // Need at least 0.5 seconds of audio
            if (duration < 0.5) {
                console.log(`⏳ Insufficient audio (${duration.toFixed(1)}s), waiting...`);
                return;
            }
            
            chunkCount++;
            console.log(`🎵 ${isMac ? 'Mac' : 'PC'} streaming chunk #${chunkCount} (${duration.toFixed(1)}s, volume: ${currentVolume.toFixed(6)})`);
            
            // Process this chunk
            processStreamingChunk(bufferCopy, chunkCount);
            
            // Keep some overlap for context
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
            
            // Remove processed audio but keep overlap
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
            // Combine audio chunks
            const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Float32Array(totalLength);
            
            let offset = 0;
            for (const chunk of audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }
            
            // Create WAV blob with actual sample rate
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
        // Convert to 16-bit PCM, compatible with any sample rate
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
        view.setUint32(24, sampleRate, true); // Use actual sample rate
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
        const timeoutId = setTimeout(() => controller.abort(), isMac ? 15000 : 10000); // Longer timeout on Mac
        
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
        const maxAttempts = isMac ? 15 : 10; // More attempts on Mac
        
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
        
        // Same logic as before...
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
            showMacCompatibleDeepfakeAlert(result);
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

    function showMacCompatibleDeepfakeAlert(result) {
        console.log(`🚨 REAL-TIME DEEPFAKE DETECTED ON ${isMac ? 'MAC' : 'PC'}!`);
        
        if (activeAlert) {
            activeAlert.remove();
        }
        
        const alert = document.createElement('div');
        activeAlert = alert;
        
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #000000;
            color: white;
            padding: 18px 22px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-weight: 200;
            z-index: 10000;
            box-shadow: 0 8px 25px rgba(220, 38, 38, 0.4);
            max-width: 300px;
            border: 2px solid #DC2626;
            backdrop-filter: blur(10px);
            animation: streamingAlertSlide 0.3s ease-out;
        `;
        
        alert.innerHTML = `
            <div style="font-size: 16px; font-weight: 200; margin-bottom: 8px; color: #DC2626;">
                AI Voice Detected
            </div>
            <div style="font-size: 13px; margin-bottom: 14px; opacity: 0.9; line-height: 1.4; font-weight: 200;">
                Confidence: ${(result.confidence * 100).toFixed(1)}%
            </div>
            <button id="dismissStreamingAlert" 
                    style="background: rgba(220, 38, 38, 0.2); border: 1px solid #DC2626; 
                           color: white; padding: 8px 16px; border-radius: 6px; 
                           cursor: pointer; font-weight: 200; font-size: 12px; 
                           transition: all 0.2s ease;">
                Dismiss
            </button>
        `;
        
        const dismissBtn = alert.querySelector('#dismissStreamingAlert');
        dismissBtn.addEventListener('click', () => {
            if (alert.parentElement) {
                alert.remove();
                activeAlert = null;
            }
        });
        
        dismissBtn.addEventListener('mouseover', () => {
            dismissBtn.style.background = 'rgba(220, 38, 38, 0.3)';
        });
        
        dismissBtn.addEventListener('mouseout', () => {
            dismissBtn.style.background = 'rgba(220, 38, 38, 0.2)';
        });
        
        // Add streaming animation
        if (!document.getElementById('streaming-alert-styles')) {
            const style = document.createElement('style');
            style.id = 'streaming-alert-styles';
            style.textContent = `
                @keyframes streamingAlertSlide {
                    from { 
                        transform: translateX(100%) scale(0.95); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateX(0) scale(1); 
                        opacity: 1; 
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
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
        
        console.log(`⏹️ Stopping ${isMac ? 'Mac' : 'PC'} real-time streaming...`);
        
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
        
        // Stop audio processing (both AudioWorklet and ScriptProcessor)
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
        
        console.log(`✅ ${isMac ? 'Mac' : 'PC'} real-time streaming stopped`);
        console.log(`📊 Session stats: ${totalDetections} detections, avg latency: ${detectionLatency.length ? (detectionLatency.reduce((a, b) => a + b, 0) / detectionLatency.length).toFixed(0) : 'N/A'}ms`);
        
        // Reset counters
        totalDetections = 0;
        detectionLatency = [];
        
        showNotification('Detection Stopped', 'Monitoring has ended', 2000);
    }

    function calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }

    function showNotification(title, message, duration = 3000) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: #000000;
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 200;
            z-index: 9999;
            max-width: 280px;
            border: 2px solid #FF6B35;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 25px rgba(255, 107, 53, 0.3);
            line-height: 1.4;
            white-space: pre-line;
        `;
        
        notification.innerHTML = `
            <div style="font-weight: 200; margin-bottom: 4px; color: #FF6B35;">
                ${title}
            </div>
            <div style="opacity: 0.9; font-weight: 200;">
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

    console.log(`✅ ${isMac ? 'Mac' : 'PC'}-Compatible Real-Time Streaming AI Voice Detector Ready!`);
}// content.js - Mac-Compatible Real-time streaming AI voice detection
if (window.aiVoiceDetectorInjected) {
    console.log('🔄 AI Voice Detector already injected, skipping...');
    throw new Error('Already injected');
} else {
    window.aiVoiceDetectorInjected = true;
    console.log('🎤 AI Voice Detector - Mac-Compatible Real-Time Streaming');

    let isMonitoring = false;
    let audioContext;
    let mediaStream = null;
    let audioWorkletNode = null;
    let scriptProcessor = null; // Fallback for older browsers
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
    const STREAM_INTERVAL = isMac ? 750 : 500; // Slower on Mac for stability
    const MIN_VOLUME_THRESHOLD = isMac ? 0.0005 : 0.001; // More sensitive on Mac
    
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

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('📨 Message received:', request);
        
        if (request.action === 'startMonitoring') {
            console.log('🖥️ Starting Mac-compatible streaming monitoring...');
            
            startRealTimeStreaming()
                .then(() => {
                    console.log('✅ Mac-compatible streaming started');
                    sendResponse({ success: true, isMonitoring: true });
                })
                .catch(error => {
                    console.error('❌ Mac-compatible streaming failed:', error);
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

        console.log('🖥️ Starting Mac-compatible audio streaming...');
        globalState.screenShareRequested = true;
        globalState.screenShareInProgress = true;
        globalState.requestTimestamp = now;
        
        try {
            showNotification(
                'Real-Time Detection', 
                'Click "Entire Screen"\nSelect your screen\nCheck "Share system audio"\nClick "Share"', 
                8000
            );
            
            // Mac-compatible media constraints
            const constraints = {
                video: true,
                audio: isMac ? {
                    // More conservative constraints for Mac
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    suppressLocalAudioPlayback: false
                    // Don't specify sampleRate on Mac - let it use default
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
            
            console.log('🎥 Mac-compatible capture setup:', {
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
            console.log('✅ Mac-compatible streaming active');
            showNotification('Detection Active', 'Monitoring for AI voices...', 3000);
            
        } catch (error) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
            
            console.error('❌ Mac streaming error:', error);
            
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
        // Create audio context with Mac-compatible settings
        try {
            if (isMac) {
                // Let Mac use its preferred sample rate
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log(`🎵 Mac audio context created with sample rate: ${audioContext.sampleRate}Hz`);
            } else {
                // Try 16kHz for Windows, fall back to default
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
        
        // Try modern AudioWorklet first, fall back to ScriptProcessor
        if (audioContext.audioWorklet && !isSafari) {
            try {
                // Use AudioWorklet for better performance (not on Safari due to bugs)
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
        // AudioWorklet setup (for modern browsers, not Safari)
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
        // ScriptProcessor fallback (Mac Safari compatible)
        const bufferSize = isMac ? 2048 : 1024; // Larger buffer on Mac for stability
        scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        let lastVolumeLog = 0;
        
        scriptProcessor.onaudioprocess = (event) => {
            if (!isMonitoring) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            processAudioData(inputData);
            
            // Log volume periodically
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
        // Add to streaming buffer
        streamingBuffer.push(new Float32Array(inputData));
        bufferDuration += inputData.length / audioContext.sampleRate;
        
        // Keep buffer size manageable (max 2 seconds)
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
            
            // Calculate current volume
            const currentVolume = streamingBuffer.length > 0 ? 
                calculateRMS(streamingBuffer[streamingBuffer.length - 1]) : 0;
            
            // Skip if audio is too quiet
            if (currentVolume < MIN_VOLUME_THRESHOLD) {
                console.log(`🔇 ${isMac ? 'Mac' : 'PC'} audio too quiet, skipping stream (${currentVolume.toFixed(6)})`);
                return;
            }
            
            // Get current buffer state
            const bufferCopy = [...streamingBuffer];
            const duration = bufferDuration;
            
            // Need at least 0.5 seconds of audio
            if (duration < 0.5) {
                console.log(`⏳ Insufficient audio (${duration.toFixed(1)}s), waiting...`);
                return;
            }
            
            chunkCount++;
            console.log(`🎵 ${isMac ? 'Mac' : 'PC'} streaming chunk #${chunkCount} (${duration.toFixed(1)}s, volume: ${currentVolume.toFixed(6)})`);
            
            // Process this chunk
            processStreamingChunk(bufferCopy, chunkCount);
            
            // Keep some overlap for context
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
            
            // Remove processed audio but keep overlap
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
            // Combine audio chunks
            const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Float32Array(totalLength);
            
            let offset = 0;
            for (const chunk of audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }
            
            // Create WAV blob with actual sample rate
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
        // Convert to 16-bit PCM, compatible with any sample rate
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
        view.setUint32(24, sampleRate, true); // Use actual sample rate
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
        const timeoutId = setTimeout(() => controller.abort(), isMac ? 15000 : 10000); // Longer timeout on Mac
        
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
        const maxAttempts = isMac ? 15 : 10; // More attempts on Mac
        
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
        
        // Same logic as before...
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
            showMacCompatibleDeepfakeAlert(result);
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

    function showMacCompatibleDeepfakeAlert(result) {
        console.log(`🚨 REAL-TIME DEEPFAKE DETECTED ON ${isMac ? 'MAC' : 'PC'}!`);
        
        if (activeAlert) {
            activeAlert.remove();
        }
        
        const alert = document.createElement('div');
        activeAlert = alert;
        
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #DC2626, #FF5733);
            color: white;
            padding: 18px 22px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-weight: 200;
            z-index: 10000;
            box-shadow: 0 8px 25px rgba(220, 38, 38, 0.4);
            max-width: 300px;
            border: 2px solid rgba(255, 107, 53, 0.5);
            backdrop-filter: blur(10px);
            animation: streamingAlertSlide 0.3s ease-out;
        `;
        
        alert.innerHTML = `
            <div style="font-size: 16px; font-weight: 300; margin-bottom: 8px;">
                AI Voice Detected
            </div>
            <div style="font-size: 13px; margin-bottom: 14px; opacity: 0.9; line-height: 1.4;">
                Confidence: ${(result.confidence * 100).toFixed(1)}%
            </div>
            <button id="dismissStreamingAlert" 
                    style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); 
                           color: white; padding: 8px 16px; border-radius: 6px; 
                           cursor: pointer; font-weight: 200; font-size: 12px; 
                           transition: all 0.2s ease;">
                Dismiss
            </button>
        `;
        
        const dismissBtn = alert.querySelector('#dismissStreamingAlert');
        dismissBtn.addEventListener('click', () => {
            if (alert.parentElement) {
                alert.remove();
                activeAlert = null;
            }
        });
        
        dismissBtn.addEventListener('mouseover', () => {
            dismissBtn.style.background = 'rgba(255, 255, 255, 0.3)';
        });
        
        dismissBtn.addEventListener('mouseout', () => {
            dismissBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        });
        
        // Add streaming animation
        if (!document.getElementById('streaming-alert-styles')) {
            const style = document.createElement('style');
            style.id = 'streaming-alert-styles';
            style.textContent = `
                @keyframes streamingAlertSlide {
                    from { 
                        transform: translateX(100%) scale(0.95); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateX(0) scale(1); 
                        opacity: 1; 
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
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
        
        console.log(`⏹️ Stopping ${isMac ? 'Mac' : 'PC'} real-time streaming...`);
        
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
        
        // Stop audio processing (both AudioWorklet and ScriptProcessor)
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
        
        console.log(`✅ ${isMac ? 'Mac' : 'PC'} real-time streaming stopped`);
        console.log(`📊 Session stats: ${totalDetections} detections, avg latency: ${detectionLatency.length ? (detectionLatency.reduce((a, b) => a + b, 0) / detectionLatency.length).toFixed(0) : 'N/A'}ms`);
        
        // Reset counters
        totalDetections = 0;
        detectionLatency = [];
        
        showNotification('Detection Stopped', 'Monitoring stopped', 2000);
    }

    function calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }

    function showNotification(title, message, duration = 3000) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 200;
            z-index: 9999;
            max-width: 280px;
            border: 2px solid #FF6B35;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 25px rgba(255, 107, 53, 0.3);
            line-height: 1.4;
            white-space: pre-line;
        `;
        
        notification.innerHTML = `
            <div style="font-weight: 300; margin-bottom: 4px; color: #FF6B35;">
                ${title}
            </div>
            <div style="opacity: 0.9;">
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

    console.log(`✅ ${isMac ? 'Mac' : 'PC'}-Compatible Real-Time Streaming AI Voice Detector Ready!`);
}// Updated notification functions for your content.js

function showMacCompatibleDeepfakeAlert(result) {
    console.log(`🚨 REAL-TIME DEEPFAKE DETECTED ON ${isMac ? 'MAC' : 'PC'}!`);
    
    if (activeAlert) {
        activeAlert.remove();
    }
    
    const alert = document.createElement('div');
    activeAlert = alert;
    
    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #DC2626, #FF5733);
        color: white;
        padding: 18px 22px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-weight: 200;
        z-index: 10000;
        box-shadow: 0 8px 25px rgba(220, 38, 38, 0.4);
        max-width: 300px;
        border: 2px solid rgba(255, 107, 53, 0.5);
        backdrop-filter: blur(10px);
        animation: streamingAlertSlide 0.3s ease-out;
    `;
    
    alert.innerHTML = `
        <div style="font-size: 16px; font-weight: 300; margin-bottom: 8px;">
            AI Voice Detected
        </div>
        <div style="font-size: 13px; margin-bottom: 14px; opacity: 0.9; line-height: 1.4;">
            Confidence: ${(result.confidence * 100).toFixed(1)}%
        </div>
        <button id="dismissStreamingAlert" 
                style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); 
                       color: white; padding: 8px 16px; border-radius: 6px; 
                       cursor: pointer; font-weight: 200; font-size: 12px; 
                       transition: all 0.2s ease;">
            Dismiss
        </button>
    `;
    
    const dismissBtn = alert.querySelector('#dismissStreamingAlert');
    dismissBtn.addEventListener('click', () => {
        if (alert.parentElement) {
            alert.remove();
            activeAlert = null;
        }
    });
    
    dismissBtn.addEventListener('mouseover', () => {
        dismissBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    });
    
    dismissBtn.addEventListener('mouseout', () => {
        dismissBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    // Add streaming animation
    if (!document.getElementById('streaming-alert-styles')) {
        const style = document.createElement('style');
        style.id = 'streaming-alert-styles';
        style.textContent = `
            @keyframes streamingAlertSlide {
                from { 
                    transform: translateX(100%) scale(0.95); 
                    opacity: 0; 
                }
                to { 
                    transform: translateX(0) scale(1); 
                    opacity: 1; 
                }
            }
        `;
        document.head.appendChild(style);
    }
    
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

function showNotification(title, message, duration = 3000) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 200;
        z-index: 9999;
        max-width: 280px;
        border: 2px solid #FF6B35;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 25px rgba(255, 107, 53, 0.3);
        line-height: 1.4;
        white-space: pre-line;
    `;
    
    notification.innerHTML = `
        <div style="font-weight: 300; margin-bottom: 4px; color: #FF6B35;">
            ${title}
        </div>
        <div style="opacity: 0.9;">
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) notification.remove();
    }, duration);
}
