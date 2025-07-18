// content.js - Simple multi-method audio capture
// Prevent multiple injections
if (window.aiVoiceDetectorInjected) {
    console.log('🔄 AI Voice Detector already injected, skipping...');
} else {
    window.aiVoiceDetectorInjected = true;
    console.log('🎤 AI Voice Detector - Multi-Method Audio Capture');

    let isMonitoring = false;
    let audioContext;
    let mediaStreams = [];
    let scriptProcessors = [];
    let activeMethods = [];

    const HF_API_URL = 'https://pauliano22-deepfake-audio-detector.hf.space/gradio_api';

    // Default settings
    let settings = {
        enableScreenCapture: true,
        enableMicrophone: true,
        enablePageAudio: true
    };

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('📨 Message received:', request);
        
        if (request.action === 'startMonitoring') {
            console.log('🎥 Starting multi-method audio monitoring...');
            
            startAllAudioCapture()
                .then(() => {
                    console.log('✅ Audio monitoring started');
                    sendResponse({ success: true, isMonitoring: true, methods: activeMethods });
                })
                .catch(error => {
                    console.error('❌ Audio capture failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;
            
        } else if (request.action === 'stopMonitoring') {
            stopAllAudioCapture();
            sendResponse({ success: true, isMonitoring: false });
            
        } else if (request.action === 'getMonitoringState') {
            sendResponse({ isMonitoring, methods: activeMethods });
            
        } else if (request.action === 'updateSettings') {
            settings = { ...settings, ...request.settings };
            console.log('⚙️ Settings updated:', settings);
            sendResponse({ success: true });
        }
        
        return true;
    });

    async function startAllAudioCapture() {
        if (isMonitoring) {
            console.log('⚠️ Already monitoring');
            return;
        }

        // Load settings from storage
        await loadSettings();
        
        console.log('🚀 Starting all available audio capture methods...');
        showNotification('🚀 Starting Audio Detection', 'Trying all available methods...', 3000);
        
        activeMethods = [];
        let successCount = 0;
        let pageAudioSuccess = false;

        // Try page audio first (highest quality)
        if (settings.enablePageAudio) {
            try {
                await startPageAudioCapture();
                activeMethods.push('Page Audio');
                pageAudioSuccess = true;
                successCount++;
                console.log('✅ Page audio capture started');
            } catch (error) {
                console.log('❌ Page audio capture failed:', error.message);
            }
        }

        // Try screen capture (good quality, works with any app)
        if (settings.enableScreenCapture) {
            try {
                await startScreenCapture();
                activeMethods.push('Screen Audio');
                successCount++;
                console.log('✅ Screen capture started');
            } catch (error) {
                console.log('❌ Screen capture failed:', error.message);
            }
        }

        // Try microphone capture (DISABLED for now to avoid conflicts)
        // if (settings.enableMicrophone && !pageAudioSuccess) {
        //     try {
        //         await startMicrophoneCapture();
        //         activeMethods.push('Microphone');
        //         successCount++;
        //         console.log('✅ Microphone capture started');
        //     } catch (error) {
        //         console.log('❌ Microphone capture failed:', error.message);
        //     }
        // } else if (settings.enableMicrophone && pageAudioSuccess) {
        //     console.log('⚠️ Skipping microphone - page audio already active (avoiding conflicts)');
        // }
        
        console.log('🎤 Microphone capture temporarily disabled to avoid conflicts with page audio');

        if (successCount === 0) {
            throw new Error('All audio capture methods failed. Try enabling different methods in settings.');
        }

        isMonitoring = true;
        console.log(`✅ ${successCount} audio capture method(s) active:`, activeMethods);
        showNotification('🎯 Audio Detection Active!', `${successCount} method(s) capturing: ${activeMethods.join(', ')}`, 5000);
    }

    async function loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['audioSettings'], (data) => {
                if (data.audioSettings) {
                    settings = { ...settings, ...data.audioSettings };
                }
                console.log('⚙️ Loaded settings:', settings);
                resolve();
            });
        });
    }

    async function startScreenCapture() {
        console.log('🖥️ Attempting screen capture...');
        
        try {
            // Show helpful notification
            showNotification('🖥️ Screen Share Request', 'Select window/screen and CHECK "Share audio"!', 5000);
            
            const mediaStream = await navigator.mediaDevices.getDisplayMedia({
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
                throw new Error('No audio from screen sharing. Make sure to check "Share audio".');
            }
            
            // Stop video tracks to save resources but keep audio
            videoTracks.forEach(track => {
                console.log('⏹️ Stopping video track to save resources:', track.label);
                track.stop();
            });
            
            mediaStreams.push(mediaStream);
            setupAudioProcessing(mediaStream, 'Screen Audio');
            
            console.log('✅ Screen audio capture active');
            
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                throw new Error('Screen sharing permission denied. Please allow and check "Share audio".');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('Screen sharing not supported in this browser.');
            } else if (error.name === 'AbortError') {
                throw new Error('Screen sharing cancelled by user.');
            } else {
                throw new Error(`Screen capture failed: ${error.message}`);
            }
        }
    }

    async function startMicrophoneCapture() {
        console.log('🎤 Attempting microphone capture...');
        
        const mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 22050
            }
        });
        
        mediaStreams.push(mediaStream);
        setupAudioProcessing(mediaStream, 'Microphone');
    }

    async function startPageAudioCapture() {
        console.log('🌐 Attempting page audio capture...');
        
        const audioElements = document.querySelectorAll('audio, video');
        console.log(`🔍 Found ${audioElements.length} audio/video elements`);
        
        if (audioElements.length === 0) {
            throw new Error('No audio/video elements found on this page.');
        }
        
        // Create audio context for page audio
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 22050
            });
        }
        
        // Try to find an element we can connect to
        let connectedElement = null;
        let lastError = null;
        
        for (const element of audioElements) {
            try {
                console.log(`🔌 Trying to connect to ${element.tagName}:`, element.src || element.currentSrc || 'no src');
                
                // Check if element already has a source node
                if (element.sourceNode) {
                    console.log('⚠️ Element already has source node, skipping');
                    continue;
                }
                
                const source = audioContext.createMediaElementSource(element);
                element.sourceNode = source; // Mark as connected
                
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 1.0;
                
                // Connect: source -> gain -> destination (speakers)
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                // Create script processor for analysis
                const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                gainNode.connect(scriptProcessor);
                
                scriptProcessors.push(scriptProcessor);
                setupPageAudioProcessing(scriptProcessor, `Page Audio (${element.tagName})`);
                
                connectedElement = element;
                console.log(`✅ Successfully connected to ${element.tagName}`);
                break;
                
            } catch (error) {
                lastError = error;
                console.log(`❌ Failed to connect to ${element.tagName}: ${error.message}`);
                
                // If CORS error, try alternative approach
                if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
                    console.log('🚨 CORS restriction detected - ElevenLabs is blocking direct audio access');
                    console.log('💡 Recommendation: Use Screen Sharing or Microphone with speakers instead');
                }
                continue;
            }
        }
        
        if (!connectedElement) {
            if (lastError) {
                if (lastError.message.includes('already connected')) {
                    throw new Error('Audio elements already in use. Try refreshing the page or use Screen Sharing instead.');
                } else if (lastError.message.includes('CORS')) {
                    throw new Error('ElevenLabs blocks direct audio access (CORS). Use Screen Sharing or Microphone with speakers.');
                } else {
                    throw new Error(`Could not connect to any audio elements: ${lastError.message}`);
                }
            } else {
                throw new Error('No suitable audio elements found for connection.');
            }
        }
        
        console.log('🌐 Page audio capture setup complete');
    }

    function setupAudioProcessing(mediaStream, source) {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 22050
            });
        }
        
        const streamSource = audioContext.createMediaStreamSource(mediaStream);
        const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
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
            if (now - lastVolumeLog > 5000) {
                console.log(`🔊 ${source} volume: ${volume.toFixed(6)}`);
                lastVolumeLog = now;
            }
            
            // Detect audio activity (volume threshold)
            const volumeThreshold = 0.01; // Adjust as needed
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
                if (bufferDuration >= 2) { // At least 2 seconds of audio
                    shouldAnalyze = true;
                    reason = 'audio stopped';
                }
            }
            
            // 2. We have 5+ seconds of audio and it's been active
            if (bufferDuration >= 5 && isActiveAudio) {
                shouldAnalyze = true;
                reason = '5+ seconds of active audio';
            }
            
            // 3. Silence timeout (analyze whatever we have after 3 seconds of silence)
            if (!isActiveAudio && silenceStart > 0 && (now - silenceStart > 3000) && bufferDuration >= 1) {
                shouldAnalyze = true;
                reason = 'silence timeout';
            }
            
            // 4. Fallback: every 15 seconds regardless
            if (now - lastAnalysisTime > 15000 && bufferDuration >= 3) {
                shouldAnalyze = true;
                reason = 'time-based fallback';
            }
            
            // Analyze if triggered
            if (shouldAnalyze) {
                processedChunks++;
                console.log(`🔄 Processing ${source} chunk #${processedChunks}: ${reason} (${bufferDuration.toFixed(1)}s, volume: ${volume.toFixed(6)})`);
                analyzeAudioBuffer([...audioBuffer], source);
                lastAnalysisTime = now;
                audioBuffer = [];
                bufferDuration = 0;
                silenceStart = 0;
            }
            
            // Prevent buffer from getting too large
            if (bufferDuration > 10) {
                console.log(`⚠️ ${source} buffer overflow, clearing`);
                audioBuffer = [];
                bufferDuration = 0;
            }
        };
        
        streamSource.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
        scriptProcessors.push(scriptProcessor);
    }

    function setupPageAudioProcessing(scriptProcessor, source) {
        let audioBuffer = [];
        let bufferDuration = 0;
        let lastAnalysisTime = 0;
        let processedChunks = 0;
        
        let isActiveAudio = false;
        let silenceStart = 0;
        
        scriptProcessor.onaudioprocess = (event) => {
            if (!isMonitoring) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            const volume = calculateRMS(inputData);
            const now = Date.now();
            
            // Log volume every 3 seconds for page audio
            if (now - lastVolumeLog > 3000) {
                console.log(`🔊 ${source} volume: ${volume.toFixed(6)} (page audio active)`);
                lastVolumeLog = now;
            }
            
            // Detect audio activity
            const volumeThreshold = 0.01;
            const wasActiveAudio = isActiveAudio;
            isActiveAudio = volume > volumeThreshold;
            
            audioBuffer.push(new Float32Array(inputData));
            bufferDuration += inputBuffer.duration;
            
            // Smart analysis triggers
            let shouldAnalyze = false;
            let reason = '';
            
            // Audio just stopped (likely end of speech/AI voice)
            if (wasActiveAudio && !isActiveAudio) {
                silenceStart = now;
                if (bufferDuration >= 2) {
                    shouldAnalyze = true;
                    reason = 'audio stopped';
                }
            }
            
            // Long active audio
            if (bufferDuration >= 5 && isActiveAudio) {
                shouldAnalyze = true;
                reason = '5+ seconds active';
            }
            
            // Silence timeout
            if (!isActiveAudio && silenceStart > 0 && (now - silenceStart > 3000) && bufferDuration >= 1) {
                shouldAnalyze = true;
                reason = 'silence timeout';
            }
            
            // Fallback timer (every 10 seconds for page audio)
            if (now - lastAnalysisTime > 10000 && bufferDuration >= 2) {
                shouldAnalyze = true;
                reason = 'timer fallback';
            }
            
            if (shouldAnalyze) {
                processedChunks++;
                console.log(`🔄 Processing ${source} chunk #${processedChunks}: ${reason} (${bufferDuration.toFixed(1)}s, vol: ${volume.toFixed(6)})`);
                analyzeAudioBuffer([...audioBuffer], source);
                lastAnalysisTime = now;
                audioBuffer = [];
                bufferDuration = 0;
                silenceStart = 0;
            }
            
            // Prevent overflow
            if (bufferDuration > 10) {
                console.log(`⚠️ ${source} buffer overflow, clearing`);
                audioBuffer = [];
                bufferDuration = 0;
            }
        };
    }

    function stopAllAudioCapture() {
        if (!isMonitoring) return;
        
        console.log('⏹️ Stopping all audio capture...');
        
        // Stop all script processors
        scriptProcessors.forEach(processor => {
            try {
                processor.disconnect();
            } catch (e) {}
        });
        scriptProcessors = [];
        
        // Stop all media streams
        mediaStreams.forEach(stream => {
            stream.getTracks().forEach(track => {
                console.log('⏹️ Stopping track:', track.label);
                track.stop();
            });
        });
        mediaStreams = [];
        
        // Close audio context
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
            audioContext = null;
        }
        
        isMonitoring = false;
        activeMethods = [];
        console.log('✅ All audio monitoring stopped');
        
        showNotification('⏹️ Monitoring Stopped', 'All audio capture stopped');
    }

    async function analyzeAudioBuffer(audioBuffer, source) {
        try {
            const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Float32Array(totalLength);
            
            let offset = 0;
            for (const chunk of audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }
            
            const volume = calculateRMS(combinedBuffer);
            
            if (volume < 0.001) {
                console.log(`🔇 ${source} audio too quiet, skipping analysis`);
                return;
            }
            
            const wavBlob = createWAVBlob(combinedBuffer, 22050);
            console.log(`📦 Analyzing ${source} audio: ${wavBlob.size} bytes`);
            
            const result = await sendToHuggingFaceAPI(wavBlob);
            
            if (result && !result.error) {
                console.log(`🎯 ${source} detection result:`, result);
                result.source = source;
                handleDetectionResult(result);
            } else {
                console.error(`❌ ${source} API error:`, result?.error);
            }
            
        } catch (error) {
            console.error(`❌ ${source} analysis failed:`, error);
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
        
        chrome.storage.local.get(['detections'], (data) => {
            const detections = data.detections || [];
            detections.push(result);
            
            if (detections.length > 100) {
                detections.splice(0, detections.length - 100);
            }
            
            chrome.storage.local.set({ detections });
        });
        
        if (result.is_suspicious) {
            showDeepfakeAlert(result);
        }
        
        chrome.runtime.sendMessage({
            type: 'detectionResult',
            result: result
        }).catch(() => {});
    }

    function showDeepfakeAlert(result) {
        console.log('🚨 DEEPFAKE DETECTED!');
        
        const alert = document.createElement('div');
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-family: Arial, sans-serif;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 8px 16px rgba(220, 53, 69, 0.4);
            max-width: 350px;
            border: 3px solid #ff0000;
            animation: alertPulse 1s infinite;
        `;
        
        alert.innerHTML = `
            🚨 DEEPFAKE DETECTED!<br>
            <div style="font-size: 14px; margin: 10px 0;">
                Source: ${result.source}<br>
                Confidence: ${(result.confidence * 100).toFixed(1)}%
            </div>
            <button onclick="this.parentElement.remove()" 
                    style="margin-top: 10px; padding: 8px 12px; border: none; 
                           border-radius: 5px; background: white; color: black; 
                           cursor: pointer; font-weight: bold;">
                Dismiss
            </button>
        `;
        
        // Add animation
        if (!document.getElementById('alert-styles')) {
            const style = document.createElement('style');
            style.id = 'alert-styles';
            style.textContent = `
                @keyframes alertPulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentElement) alert.remove();
        }, 20000);
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
            top: 10px;
            right: 10px;
            background: rgba(40, 167, 69, 0.9);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            z-index: 9999;
            max-width: 300px;
            border: 2px solid #28a745;
        `;
        
        notification.innerHTML = `<strong>${title}</strong><br>${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, duration);
    }

    console.log('✅ Multi-Method AI Voice Detector ready!');
}