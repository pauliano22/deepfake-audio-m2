// content.js - Real-time streaming AI voice detection
if (window.aiVoiceDetectorInjected) {
    console.log('🔄 AI Voice Detector already injected, skipping...');
    throw new Error('Already injected');
} else {
    window.aiVoiceDetectorInjected = true;
    console.log('🎤 AI Voice Detector - Real-Time Streaming');

    let isMonitoring = false;
    let audioContext;
    let mediaStream = null;
    let scriptProcessor = null;
    let streamingInterval = null;
    
    // Global state management
    if (!window.aiVoiceDetectorGlobalState) {
        window.aiVoiceDetectorGlobalState = {
            screenShareRequested: false,
            screenShareInProgress: false,
            requestTimestamp: 0
        };
    }
    
    const globalState = window.aiVoiceDetectorGlobalState;

    // Real-time streaming parameters
    const STREAM_INTERVAL = 500; // Send audio every 500ms
    const CHUNK_SIZE = 8000; // 0.5 seconds at 16kHz
    const MIN_VOLUME_THRESHOLD = 0.001;
    
    // Anti-spam controls (more aggressive for real-time)
    let lastAlertTime = 0;
    const ALERT_COOLDOWN = 2000; // 2 seconds between alerts
    let recentDetections = [];
    const DETECTION_WINDOW = 2000; // 2 second window
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
            console.log('🖥️ Starting real-time streaming monitoring...');
            
            startRealTimeStreaming()
                .then(() => {
                    console.log('✅ Real-time streaming started');
                    sendResponse({ success: true, isMonitoring: true });
                })
                .catch(error => {
                    console.error('❌ Real-time streaming failed:', error);
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

        console.log('🖥️ Starting real-time audio streaming...');
        globalState.screenShareRequested = true;
        globalState.screenShareInProgress = true;
        globalState.requestTimestamp = now;
        
        try {
            showNotification('Real-Time Detection', 'Click "Entire Screen"\nSelect your screen\nCheck "Also share system audio"\nClick "Share"', 8000);
            
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 16000, // Optimized for real-time
                    suppressLocalAudioPlayback: false
                }
            });
            
            const audioTracks = mediaStream.getAudioTracks();
            const videoTracks = mediaStream.getVideoTracks();
            
            console.log('🎥 Real-time capture setup:', {
                audio: audioTracks.length,
                video: videoTracks.length,
                audioSettings: audioTracks[0]?.getSettings()
            });
            
            if (audioTracks.length === 0) {
                videoTracks.forEach(track => track.stop());
                throw new Error('No system audio detected! You must check "Also share system audio".');
            }
            
            // Stop video tracks to save resources
            videoTracks.forEach(track => {
                console.log('⏹️ Stopping video track to save resources');
                track.stop();
            });
            
            // Setup real-time audio processing
            setupRealTimeAudioProcessing();
            
            // Start streaming interval
            startStreamingInterval();
            
            // Handle stream ending
            audioTracks[0].addEventListener('ended', () => {
                console.log('🔚 Screen sharing ended by user');
                stopRealTimeStreaming();
            });
            
            isMonitoring = true;
            globalState.screenShareInProgress = false;
            console.log('✅ Real-time streaming active');
            showNotification('Real-Time Detection Active', 'Continuous monitoring for AI voices...', 3000);
            
        } catch (error) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
            
            if (error.name === 'NotAllowedError') {
                throw new Error('Permission denied. Please allow screen sharing and check "Also share system audio".');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('Screen sharing not supported in this browser.');
            } else if (error.name === 'AbortError') {
                throw new Error('Screen sharing cancelled. Make sure to check "Also share system audio".');
            } else {
                throw new Error(`Real-time streaming failed: ${error.message}`);
            }
        }
    }

    function setupRealTimeAudioProcessing() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
        }
        
        const streamSource = audioContext.createMediaStreamSource(mediaStream);
        scriptProcessor = audioContext.createScriptProcessor(1024, 1, 1); // Smaller buffer for real-time
        
        let lastVolumeLog = 0;
        
        scriptProcessor.onaudioprocess = (event) => {
            if (!isMonitoring) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            const now = Date.now();
            
            // Calculate volume
            const volume = calculateRMS(inputData);
            
            // Log volume periodically
            if (now - lastVolumeLog > 10000) {
                console.log(`🔊 Real-time audio volume: ${volume.toFixed(6)}`);
                lastVolumeLog = now;
            }
            
            // Add to streaming buffer
            streamingBuffer.push(new Float32Array(inputData));
            bufferDuration += inputBuffer.duration;
            
            // Keep buffer size manageable (max 2 seconds)
            while (bufferDuration > 2.0) {
                const removedChunk = streamingBuffer.shift();
                if (removedChunk) {
                    bufferDuration -= removedChunk.length / 16000;
                }
            }
        };
        
        streamSource.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
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
                console.log(`🔇 Audio too quiet, skipping stream (${currentVolume.toFixed(6)})`);
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
            console.log(`🎵 Streaming chunk #${chunkCount} (${duration.toFixed(1)}s, volume: ${currentVolume.toFixed(6)})`);
            
            // Process this chunk
            processStreamingChunk(bufferCopy, chunkCount);
            
            // Keep some overlap for context (keep last 0.5s)
            const overlapDuration = 0.5;
            const overlapSamples = Math.floor(overlapDuration * 16000);
            
            // Calculate how much to remove
            let samplesToRemove = 0;
            let removedDuration = 0;
            
            for (let i = 0; i < streamingBuffer.length; i++) {
                const chunkSamples = streamingBuffer[i].length;
                const chunkDuration = chunkSamples / 16000;
                
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
                    bufferDuration -= chunk.length / 16000;
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
            
            // Create optimized WAV blob
            const wavBlob = createStreamingWAVBlob(combinedBuffer, 16000);
            console.log(`📦 Streaming analysis #${chunkId}: ${wavBlob.size} bytes`);
            
            const result = await sendToStreamingAPI(wavBlob);
            
            if (result && !result.error) {
                const latency = Date.now() - startTime;
                detectionLatency.push(latency);
                
                console.log(`🎯 Streaming result #${chunkId}:`, result, `(${latency}ms)`);
                
                result.source = 'Real-Time Stream';
                result.chunkId = chunkId;
                result.latency = latency;
                
                handleStreamingResult(result);
            } else {
                console.error(`❌ Streaming API error #${chunkId}:`, result?.error);
            }
            
        } catch (error) {
            console.error(`❌ Streaming analysis failed #${chunkId}:`, error);
        }
    }

    async function sendToStreamingAPI(audioBlob) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for streaming
        
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
        const maxAttempts = 10; // Reduced for faster streaming
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await fetch(`${HF_API_URL}/call/predict/${eventId}`, { signal });
                
                if (!response.ok) {
                    await new Promise(resolve => setTimeout(resolve, 200));
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
            
            await new Promise(resolve => setTimeout(resolve, 300));
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
                is_suspicious: fakeProb > 0.6, // Streaming threshold
                raw_result: markdownResult,
                timestamp: new Date().toISOString(),
                url: window.location.href
            };
            
        } catch (error) {
            console.error('❌ Streaming result parsing error:', error);
            return {
                prediction: 'UNKNOWN',
                confidence: 0.5,
                error: error.message
            };
        }
    }

    function handleStreamingResult(result) {
        totalDetections++;
        console.log(`🎯 Processing streaming result #${totalDetections}:`, result);
        
        // Less aggressive duplicate detection for streaming
        const now = Date.now();
        const resultKey = `${result.prediction}-${Math.round(result.confidence * 20)}`;
        
        recentDetections = recentDetections.filter(det => now - det.time < DETECTION_WINDOW);
        
        // Only block if very recent and identical
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
                
                if (detections.length > 150) { // Higher limit for streaming
                    detections.splice(0, detections.length - 150);
                }
                
                chrome.storage.local.set({ detections });
            });
        } catch (error) {
            console.log('⚠️ Could not store detection:', error.message);
        }
        
        // Show real-time alert
        if (result.is_suspicious && shouldShowStreamingAlert()) {
            showStreamingDeepfakeAlert(result);
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

    function showStreamingDeepfakeAlert(result) {
        console.log('🚨 REAL-TIME DEEPFAKE DETECTED!');
        
        if (activeAlert) {
            activeAlert.remove();
        }
        
        const alert = document.createElement('div');
        activeAlert = alert;
        
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ff0000, #cc0000);
            color: white;
            padding: 18px 22px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 8px 25px rgba(255, 0, 0, 0.4);
            max-width: 340px;
            border: 2px solid #ff4444;
            backdrop-filter: blur(10px);
            animation: streamingAlertSlide 0.3s ease-out;
        `;
        
        const avgLatency = detectionLatency.slice(-5).reduce((a, b) => a + b, 0) / Math.min(detectionLatency.length, 5);
        
        alert.innerHTML = `
            <div style="font-size: 17px; font-weight: 700; margin-bottom: 10px;">
                ⚡ REAL-TIME AI DETECTED
            </div>
            <div style="font-size: 13px; margin-bottom: 14px; opacity: 0.95; line-height: 1.5;">
                Confidence: ${(result.confidence * 100).toFixed(1)}%<br>
                Detection Time: ${result.latency || 'N/A'}ms<br>
                Chunk: #${result.chunkId || 'N/A'}
            </div>
            <button id="dismissStreamingAlert" 
                    style="background: rgba(255, 255, 255, 0.25); border: 1px solid rgba(255, 255, 255, 0.4); 
                           color: white; padding: 8px 16px; border-radius: 6px; 
                           cursor: pointer; font-weight: 600; font-size: 12px; 
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
            dismissBtn.style.background = 'rgba(255, 255, 255, 0.35)';
        });
        
        dismissBtn.addEventListener('mouseout', () => {
            dismissBtn.style.background = 'rgba(255, 255, 255, 0.25)';
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
        
        console.log('⏹️ Stopping real-time streaming...');
        
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
        if (scriptProcessor) {
            try {
                scriptProcessor.disconnect();
            } catch (e) {}
            scriptProcessor = null;
        }
        
        // Stop media stream
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => {
                console.log('⏹️ Stopping streaming track:', track.label);
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
        
        console.log('✅ Real-time streaming stopped');
        console.log(`📊 Session stats: ${totalDetections} detections, avg latency: ${detectionLatency.length ? (detectionLatency.reduce((a, b) => a + b, 0) / detectionLatency.length).toFixed(0) : 'N/A'}ms`);
        
        // Reset counters
        totalDetections = 0;
        detectionLatency = [];
        
        showNotification('Real-Time Detection Stopped', 'Streaming monitoring stopped');
    }

    function calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }

    function createStreamingWAVBlob(audioBuffer, sampleRate) {
        // Use 16-bit PCM for streaming - balance between quality and speed
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

    function showNotification(title, message, duration = 3000) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: linear-gradient(135deg, #000000, #333333);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 600;
            z-index: 9999;
            max-width: 300px;
            border: 2px solid #ff0000;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 25px rgba(255, 0, 0, 0.3);
            line-height: 1.5;
            white-space: pre-line;
        `;
        
        notification.innerHTML = `<div style="font-weight: 700; margin-bottom: 4px;">⚡ ${title}</div><div style="opacity: 0.9;">${message}</div>`;
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

    console.log('✅ Real-Time Streaming AI Voice Detector Ready!');
}