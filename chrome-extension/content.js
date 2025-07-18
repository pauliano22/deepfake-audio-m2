// content.js - Simplified screen audio capture only
// Prevent multiple injections with stronger protection
if (window.aiVoiceDetectorInjected) {
    console.log('🔄 AI Voice Detector already injected, skipping...');
    throw new Error('Already injected'); // Forcefully stop execution
} else {
    window.aiVoiceDetectorInjected = true;
    console.log('🎤 AI Voice Detector - Screen Audio Capture');

    let isMonitoring = false;
    let audioContext;
    let mediaStream = null;
    let scriptProcessor = null;
    
    // GLOBAL state management to prevent double popups
    if (!window.aiVoiceDetectorGlobalState) {
        window.aiVoiceDetectorGlobalState = {
            screenShareRequested: false,
            screenShareInProgress: false,
            requestTimestamp: 0
        };
    }
    
    const globalState = window.aiVoiceDetectorGlobalState;

    // Anti-spam controls - REDUCED to be less aggressive
    let lastAlertTime = 0;
    const ALERT_COOLDOWN = 4000; // 5 seconds between alerts
    let recentDetections = [];
    const DETECTION_WINDOW = 5000; // REDUCED from 10s to 5s window for duplicate detection
    let activeAlert = null; // Track current alert to prevent overlapping

    const HF_API_URL = 'https://pauliano22-deepfake-audio-detector.hf.space/gradio_api';

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('📨 Message received:', request);
        
        if (request.action === 'startMonitoring') {
            console.log('🖥️ Starting screen audio monitoring...');
            
            startScreenAudioCapture()
                .then(() => {
                    console.log('✅ Screen audio monitoring started');
                    sendResponse({ success: true, isMonitoring: true });
                })
                .catch(error => {
                    console.error('❌ Screen audio capture failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;
            
        } else if (request.action === 'stopMonitoring') {
            stopScreenAudioCapture();
            sendResponse({ success: true, isMonitoring: false });
            
        } else if (request.action === 'getMonitoringState') {
            sendResponse({ isMonitoring });
        }
        
        return true;
    });

    async function startScreenAudioCapture() {
        if (isMonitoring) {
            console.log('⚠️ Already monitoring');
            return;
        }

        const now = Date.now();
        
        // Aggressive prevention of multiple dialogs
        if (globalState.screenShareRequested || globalState.screenShareInProgress) {
            console.log('⚠️ Screen share blocked - already in progress');
            throw new Error('Screen sharing request already in progress. Please wait or refresh the page.');
        }
        
        // Additional time-based protection (prevent requests within 10 seconds)
        if (now - globalState.requestTimestamp < 10000) {
            console.log('⚠️ Screen share blocked - too recent');
            throw new Error('Please wait a moment before requesting screen share again.');
        }

        console.log('🖥️ Starting screen audio capture...');
        globalState.screenShareRequested = true;
        globalState.screenShareInProgress = true;
        globalState.requestTimestamp = now;
        
        try {
            // Show detailed instruction notification
            showNotification('Screen Share Required', 'Click "Entire Screen"\nSelect your screen\nCheck "Also share system audio"\nClick "Share"', 10000);
            
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 22050,
                    suppressLocalAudioPlayback: false
                }
            });
            
            const audioTracks = mediaStream.getAudioTracks();
            const videoTracks = mediaStream.getVideoTracks();
            
            console.log('🎥 Screen capture tracks:', {
                audio: audioTracks.length,
                video: videoTracks.length,
                audioSettings: audioTracks[0]?.getSettings(),
                videoLabel: videoTracks[0]?.label
            });
            
            if (audioTracks.length === 0) {
                // Clean up video tracks
                videoTracks.forEach(track => track.stop());
                throw new Error('No system audio detected! You must select "Entire screen" and check "Also share system audio".');
            }
            
            // Stop video tracks to save resources but keep audio
            videoTracks.forEach(track => {
                console.log('⏹️ Stopping video track to save resources');
                track.stop();
            });
            
            // Set up audio processing
            setupAudioProcessing();
            
            // Handle stream ending
            audioTracks[0].addEventListener('ended', () => {
                console.log('🔚 Screen sharing ended by user');
                stopScreenAudioCapture();
            });
            
            isMonitoring = true;
            globalState.screenShareInProgress = false; // Clear the progress flag on success
            console.log('✅ Screen audio capture active');
            showNotification('Detection Active', 'Monitoring system audio for AI voices...', 3000);
            
        } catch (error) {
            // Reset ALL flags on any error
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
            
            if (error.name === 'NotAllowedError') {
                throw new Error('Permission denied. Please allow screen sharing and check "Also share system audio".');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('Screen sharing not supported in this browser.');
            } else if (error.name === 'AbortError') {
                throw new Error('Screen sharing cancelled. Make sure to select "Entire screen" and check "Also share system audio".');
            } else {
                throw new Error(`Screen capture failed: ${error.message}`);
            }
        }
    }

    function setupAudioProcessing() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 22050
            });
        }
        
        const streamSource = audioContext.createMediaStreamSource(mediaStream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        let audioBuffer = [];
        let bufferDuration = 0;
        let lastAnalysisTime = 0;
        let processedChunks = 0;
        
        let isActiveAudio = false;
        let silenceStart = 0;
        let lastVolumeLog = 0;
        
        scriptProcessor.onaudioprocess = (event) => {
            if (!isMonitoring) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            const volume = calculateRMS(inputData);
            const now = Date.now();
            
            // Log volume periodically for debugging
            if (now - lastVolumeLog > 10000) { // Every 10 seconds
                console.log(`🔊 Screen audio volume: ${volume.toFixed(6)}`);
                lastVolumeLog = now;
            }
            
            // Detect audio activity - LOWERED threshold for better sensitivity
            const volumeThreshold = 0.005; // REDUCED from 0.01 to catch quieter audio
            const wasActiveAudio = isActiveAudio;
            isActiveAudio = volume > volumeThreshold;
            
            // Always collect audio data
            audioBuffer.push(new Float32Array(inputData));
            bufferDuration += inputBuffer.duration;
            
            // Trigger analysis in these cases:
            let shouldAnalyze = false;
            let reason = '';
            
            // 1. Audio just stopped (end of speech/AI voice)
            if (wasActiveAudio && !isActiveAudio) {
                silenceStart = now;
                if (bufferDuration >= 2) { // REDUCED from 3 to 2 seconds
                    shouldAnalyze = true;
                    reason = 'audio stopped';
                }
            }
            
            // 2. We have 4+ seconds of continuous audio - REDUCED from 6 seconds
            if (bufferDuration >= 4 && isActiveAudio) {
                shouldAnalyze = true;
                reason = '4+ seconds of active audio';
            }
            
            // 3. Silence timeout (analyze after 3 seconds of silence) - REDUCED from 4 seconds
            if (!isActiveAudio && silenceStart > 0 && (now - silenceStart > 3000) && bufferDuration >= 1.5) {
                shouldAnalyze = true;
                reason = 'silence timeout';
            }
            
            // 4. Fallback: every 15 seconds regardless - REDUCED from 20 seconds
            if (now - lastAnalysisTime > 15000 && bufferDuration >= 2) {
                shouldAnalyze = true;
                reason = 'time-based fallback';
            }
            
            // Analyze if triggered
            if (shouldAnalyze) {
                processedChunks++;
                console.log(`🔄 Processing chunk #${processedChunks}: ${reason} (${bufferDuration.toFixed(1)}s, volume: ${volume.toFixed(6)})`);
                analyzeAudioBuffer([...audioBuffer]);
                lastAnalysisTime = now;
                audioBuffer = [];
                bufferDuration = 0;
                silenceStart = 0;
            }
            
            // Prevent buffer overflow - INCREASED limit
            if (bufferDuration > 15) { // INCREASED from 12 to 15 seconds
                console.log(`⚠️ Audio buffer overflow, clearing`);
                audioBuffer = [];
                bufferDuration = 0;
            }
        };
        
        streamSource.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
    }

    function stopScreenAudioCapture() {
        if (!isMonitoring) return;
        
        console.log('⏹️ Stopping screen audio capture...');
        
        // Clear anti-spam data
        lastAlertTime = 0;
        recentDetections = [];
        if (activeAlert) {
            activeAlert.remove();
            activeAlert = null;
        }
        
        // Stop script processor
        if (scriptProcessor) {
            try {
                scriptProcessor.disconnect();
            } catch (e) {}
            scriptProcessor = null;
        }
        
        // Stop media stream
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => {
                console.log('⏹️ Stopping track:', track.label);
                track.stop();
            });
            mediaStream = null;
        }
        
        // Close audio context
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
            audioContext = null;
        }
        
        // Reset all flags including global state
        isMonitoring = false;
        if (globalState) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
        }
        
        console.log('✅ Screen audio monitoring stopped');
        
        showNotification('Monitoring Stopped', 'Screen audio capture stopped');
    }

    // Cleanup function for global access
    window.aiVoiceDetectorCleanup = function() {
        stopScreenAudioCapture();
        if (globalState) {
            globalState.screenShareRequested = false;
            globalState.screenShareInProgress = false;
            globalState.requestTimestamp = 0;
        }
    };

    async function analyzeAudioBuffer(audioBuffer) {
        try {
            const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Float32Array(totalLength);
            
            let offset = 0;
            for (const chunk of audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }
            
            const volume = calculateRMS(combinedBuffer);
            
            // LOWERED threshold to catch quieter audio
            if (volume < 0.0005) { // REDUCED from 0.001 to 0.0005
                console.log(`🔇 Audio too quiet, skipping analysis (volume: ${volume.toFixed(6)})`);
                return;
            }
            
            const wavBlob = createWAVBlob(combinedBuffer, 22050);
            console.log(`📦 Analyzing audio: ${wavBlob.size} bytes`);
            
            const result = await sendToHuggingFaceAPI(wavBlob);
            
            if (result && !result.error) {
                console.log(`🎯 Detection result:`, result);
                result.source = 'Screen Audio';
                handleDetectionResult(result);
            } else {
                console.error(`❌ API error:`, result?.error);
            }
            
        } catch (error) {
            console.error(`❌ Analysis failed:`, error);
        }
    }

    async function sendToHuggingFaceAPI(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('files', audioBlob, 'audio.wav');
            
            const uploadResponse = await fetch(`${HF_API_URL}/upload`, {
                method: 'POST',
                body: formData
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
                })
            });
            
            if (!predictionResponse.ok) {
                throw new Error(`Prediction failed: ${predictionResponse.status}`);
            }
            
            const predictionResult = await predictionResponse.json();
            const eventId = predictionResult.event_id;
            
            const rawResult = await pollForResults(eventId);
            return parseHuggingFaceResult(rawResult);
            
        } catch (error) {
            console.error('❌ HuggingFace API error:', error);
            return { error: error.message };
        }
    }

    async function pollForResults(eventId) {
        const maxAttempts = 20;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await fetch(`${HF_API_URL}/call/predict/${eventId}`);
                if (!response.ok) continue;
                
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
                console.warn(`Polling attempt ${attempt + 1} failed:`, error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error('Polling timeout');
    }

    function parseHuggingFaceResult(markdownResult) {
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
                url: window.location.href
            };
            
        } catch (error) {
            console.error('❌ Result parsing error:', error);
            return {
                prediction: 'UNKNOWN',
                confidence: 0.5,
                error: error.message
            };
        }
    }

    function handleDetectionResult(result) {
        console.log('🎯 Handling detection result:', result);
        
        // Check for duplicate/spam detection - MADE LESS AGGRESSIVE
        const now = Date.now();
        const resultKey = `${result.prediction}-${Math.round(result.confidence * 20)}`; // MORE GRANULAR: *20 instead of *10
        
        // Clean old detections
        recentDetections = recentDetections.filter(det => now - det.time < DETECTION_WINDOW);
        
        // ONLY ignore if EXACT same prediction AND confidence AND very recent (within 2 seconds)
        const isDuplicate = recentDetections.some(det => 
            det.key === resultKey && (now - det.time < 2000)
        );
        
        if (isDuplicate) {
            console.log('🔄 Recent duplicate detection ignored:', resultKey);
            return;
        }
        
        // Add to recent detections
        recentDetections.push({
            key: resultKey,
            time: now
        });
        
        // Store detection - ADD ERROR HANDLING
        try {
            chrome.storage.local.get(['detections'], (data) => {
                const detections = data.detections || [];
                detections.push(result);
                
                if (detections.length > 100) {
                    detections.splice(0, detections.length - 100);
                }
                
                chrome.storage.local.set({ detections });
            });
        } catch (error) {
            console.log('⚠️ Could not store detection (extension context issue):', error.message);
            // Continue anyway - this isn't critical for detection alerts
        }
        
        // Show alert with anti-spam protection
        if (result.is_suspicious && shouldShowAlert()) {
            showDeepfakeAlert(result);
            lastAlertTime = now;
        }
        
        // Send message to popup - ADD ERROR HANDLING
        try {
            chrome.runtime.sendMessage({
                type: 'detectionResult',
                result: result
            }).catch(() => {
                // Ignore - popup might not be open
            });
        } catch (error) {
            console.log('⚠️ Could not send message to popup (extension context issue):', error.message);
            // Continue anyway - the alert will still show
        }
    }

    function shouldShowAlert() {
        const now = Date.now();
        return now - lastAlertTime >= ALERT_COOLDOWN && !activeAlert;
    }

    function showDeepfakeAlert(result) {
        console.log('🚨 DEEPFAKE DETECTED!');
        
        // Remove any existing alert
        if (activeAlert) {
            activeAlert.remove();
        }
        
        const alert = document.createElement('div');
        activeAlert = alert;
        
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: black;
            color: white;
            padding: 20px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 8px 5px rgba(239, 68, 68, 0.4);
            max-width: 320px;
            border: 1px solid red;
            backdrop-filter: blur(10px);
            animation: alertSlideIn 0.4s ease-out;
        `;
        
        alert.innerHTML = `
            <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">
                AI Detected
            </div>
            <div style="font-size: 13px; margin-bottom: 12px; opacity: 0.9; line-height: 1.4;">
                Confidence: ${(result.confidence * 100).toFixed(1)}%<br>
                Source: System Audio
            </div>
            <button id="dismissAlert" 
                    style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); 
                           color: white; padding: 8px 16px; border-radius: 6px; 
                           cursor: pointer; font-weight: 600; font-size: 12px; 
                           transition: all 0.2s ease; backdrop-filter: blur(10px);">
                Dismiss
            </button>
        `;
        
        // Add working dismiss button event listener
        const dismissBtn = alert.querySelector('#dismissAlert');
        dismissBtn.addEventListener('click', function() {
            if (alert.parentElement) {
                alert.remove();
                activeAlert = null;
            }
        });
        
        dismissBtn.addEventListener('mouseover', function() {
            this.style.background = 'rgba(255, 255, 255, 0.3)';
        });
        
        dismissBtn.addEventListener('mouseout', function() {
            this.style.background = 'rgba(255, 255, 255, 0.2)';
        });
        
        // Add animation
        if (!document.getElementById('alert-styles')) {
            const style = document.createElement('style');
            style.id = 'alert-styles';
            style.textContent = `
                @keyframes alertSlideIn {
                    from { 
                        transform: translateX(100%) scale(0.9); 
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
        
        // Auto-dismiss after 12 seconds
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
                if (activeAlert === alert) {
                    activeAlert = null;
                }
            }
        }, 12000);
    }

    function calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }

    function createWAVBlob(audioBuffer, sampleRate) {
        const pcmBuffer = new Int16Array(audioBuffer.length);
        for (let i = 0; i < audioBuffer.length; i++) {
            pcmBuffer[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32768));
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
            background: black;
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 600;
            z-index: 9999;
            max-width: 300px;
            border: 1px solid red;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 5px red;
            line-height: 1.5;
            white-space: pre-line;
        `;
        
        notification.innerHTML = `<div style="font-weight: 700; margin-bottom: 4px;">${title}</div><div style="opacity: 0.9;">${message}</div>`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, duration);
    }

    console.log('✅ AI Voice Detector ready - Screen Audio Only!');
}