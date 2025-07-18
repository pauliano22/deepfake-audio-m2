// popup.js - Simple multi-method with settings
let isMonitoring = false;
let activeMethods = [];

// Default settings - Screen sharing as primary method
let settings = {
    enableScreenCapture: true,
    enableMicrophone: false,  // Off by default (doesn't work with headphones)
    enablePageAudio: false    // Off by default (limited support)
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 AI Voice Detector popup loaded - Simple multi-method');
    
    await loadSettings();
    await checkAPIStatus();
    await loadDetectionHistory();
    await checkCurrentState();
    
    // Set up event listeners
    document.getElementById('toggleBtn').addEventListener('click', toggleMonitoring);
    document.getElementById('testBtn').addEventListener('click', testDetection);
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
    
    // Settings panel toggle
    document.getElementById('settingsHeader').addEventListener('click', toggleSettings);
    
    // Settings toggles
    document.getElementById('toggleScreen').addEventListener('click', () => toggleSetting('enableScreenCapture'));
    document.getElementById('toggleMic').addEventListener('click', () => toggleSetting('enableMicrophone'));
    document.getElementById('togglePage').addEventListener('click', () => toggleSetting('enablePageAudio'));
    
    // Auto-refresh every 5 seconds
    setInterval(() => {
        loadDetectionHistory();
        checkCurrentState();
    }, 5000);
});

async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['audioSettings'], (data) => {
            if (data.audioSettings) {
                settings = { ...settings, ...data.audioSettings };
            }
            updateSettingsUI();
            resolve();
        });
    });
}

async function saveSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.set({ audioSettings: settings }, resolve);
    });
}

function updateSettingsUI() {
    document.getElementById('toggleScreen').classList.toggle('active', settings.enableScreenCapture);
    document.getElementById('toggleMic').classList.toggle('active', settings.enableMicrophone);
    document.getElementById('togglePage').classList.toggle('active', settings.enablePageAudio);
}

function toggleSettings() {
    const content = document.getElementById('settingsContent');
    const chevron = document.getElementById('settingsChevron');
    
    content.classList.toggle('show');
    chevron.classList.toggle('rotated');
}

async function toggleSetting(settingName) {
    settings[settingName] = !settings[settingName];
    updateSettingsUI();
    await saveSettings();
    
    // Send updated settings to content script if monitoring
    if (isMonitoring) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                await sendMessageToTab(tab.id, { 
                    action: 'updateSettings', 
                    settings: settings 
                });
            }
        } catch (error) {
            console.log('Could not update settings in content script:', error);
        }
    }
}

async function checkAPIStatus() {
    const statusEl = document.getElementById('status');
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('https://pauliano22-deepfake-audio-detector.hf.space/', {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        statusEl.className = 'status connected';
        statusEl.innerHTML = '✅ Ready';
        
    } catch (error) {
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = '⚠️ API Issue';
        console.warn('API check failed:', error);
    }
}

async function checkCurrentState() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;
        
        const response = await sendMessageToTab(tab.id, { action: 'getMonitoringState' });
        
        if (response && response.isMonitoring) {
            isMonitoring = true;
            activeMethods = response.methods || [];
            updateUIForMonitoring(true);
        } else {
            isMonitoring = false;
            activeMethods = [];
            updateUIForMonitoring(false);
        }
        
    } catch (error) {
        isMonitoring = false;
        activeMethods = [];
        updateUIForMonitoring(false);
    }
}

async function toggleMonitoring() {
    const btn = document.getElementById('toggleBtn');
    const statusEl = document.getElementById('status');
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.id) {
            throw new Error('No active tab found');
        }
        
        if (isMonitoring) {
            // Stop monitoring
            btn.innerHTML = '<span class="loading"></span> Stopping...';
            
            await sendMessageToTab(tab.id, { action: 'stopMonitoring' });
            
            isMonitoring = false;
            activeMethods = [];
            updateUIForMonitoring(false);
            
        } else {
            // Start monitoring
            btn.innerHTML = '<span class="loading"></span> Starting...';
            
            // Check if at least one method is enabled
            if (!settings.enableScreenCapture && !settings.enableMicrophone && !settings.enablePageAudio) {
                throw new Error('Enable at least one audio source in settings');
            }
            
            // Inject content script
            await injectContentScript(tab.id);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const response = await sendMessageToTab(tab.id, { action: 'startMonitoring' });
            
            if (response && response.success) {
                isMonitoring = true;
                activeMethods = response.methods || [];
                updateUIForMonitoring(true);
            } else {
                throw new Error(response?.error || 'Failed to start monitoring');
            }
        }
        
    } catch (error) {
        console.error('Failed to toggle monitoring:', error);
        
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = '❌ ' + error.message;
        
        isMonitoring = false;
        activeMethods = [];
        updateUIForMonitoring(false);
        
        setTimeout(() => {
            if (!isMonitoring) {
                statusEl.className = 'status connected';
                statusEl.innerHTML = '✅ Ready';
            }
        }, 3000);
        
    } finally {
        btn.disabled = false;
        if (btn.innerHTML.includes('loading')) {
            btn.innerHTML = originalText;
        }
    }
}

function updateUIForMonitoring(monitoring) {
    const btn = document.getElementById('toggleBtn');
    const statusEl = document.getElementById('status');
    const methodsEl = document.getElementById('activeMethods');
    
    if (monitoring) {
        btn.innerHTML = '⏹️ Stop Listening';
        btn.className = 'main-button danger';
        statusEl.className = 'status monitoring';
        statusEl.innerHTML = '🔄 Listening...';
        
        if (activeMethods.length > 0) {
            methodsEl.style.display = 'block';
            methodsEl.innerHTML = `📡 Active: <strong>${activeMethods.join(', ')}</strong>`;
        }
    } else {
        btn.innerHTML = '🎙️ Start Listening';
        btn.className = 'main-button';
        
        if (statusEl.className !== 'status disconnected') {
            statusEl.className = 'status connected';
            statusEl.innerHTML = '✅ Ready';
        }
        
        methodsEl.style.display = 'none';
    }
}

async function injectContentScript(tabId) {
    try {
        console.log('🔄 Injecting content script into tab:', tabId);
        
        // Cleanup existing monitoring
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    if (window.aiVoiceDetectorInjected && typeof stopAllAudioCapture === 'function') {
                        console.log('🛑 Stopping existing monitoring...');
                        stopAllAudioCapture();
                    }
                    window.aiVoiceDetectorInjected = false;
                }
            });
        } catch (cleanupError) {
            console.log('Cleanup completed');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Inject fresh content script
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        
        console.log('✅ Content script injected successfully');
        
    } catch (error) {
        console.error('❌ Failed to inject content script:', error);
        
        if (error.message.includes('Cannot access')) {
            throw new Error('Cannot access this page. Try a different website.');
        } else if (error.message.includes('chrome://')) {
            throw new Error('Cannot run on Chrome system pages.');
        } else {
            throw new Error('Failed to inject script: ' + error.message);
        }
    }
}

async function sendMessageToTab(tabId, message) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch (error) {
        if (error.message.includes('Could not establish connection')) {
            throw new Error('Content script not ready. Please try again.');
        }
        throw error;
    }
}

async function testDetection() {
    const testBtn = document.getElementById('testBtn');
    const originalText = testBtn.innerHTML;
    
    testBtn.innerHTML = '<span class="loading"></span>';
    testBtn.disabled = true;
    
    try {
        const scenarios = [
            {
                prediction: 'FAKE',
                confidence: 0.87,
                source: 'Test - Fake Voice',
                is_suspicious: true,
                probabilities: { real: 0.13, fake: 0.87 }
            },
            {
                prediction: 'REAL',
                confidence: 0.92,
                source: 'Test - Real Voice',
                is_suspicious: false,
                probabilities: { real: 0.92, fake: 0.08 }
            }
        ];
        
        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        
        const testResult = {
            timestamp: new Date().toISOString(),
            url: 'test://voice-detector',
            ...scenario
        };
        
        await storeDetection(testResult);
        await loadDetectionHistory();
        
        testBtn.innerHTML = '✅';
        setTimeout(() => {
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
        }, 1500);
        
    } catch (error) {
        console.error('Test failed:', error);
        testBtn.innerHTML = '❌';
        setTimeout(() => {
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
        }, 2000);
    }
}

async function loadDetectionHistory() {
    try {
        chrome.storage.local.get(['detections'], (data) => {
            const detections = data.detections || [];
            updateDetectionStats(detections);
            displayDetections(detections.slice(-5).reverse());
        });
    } catch (error) {
        console.error('Failed to load detection history:', error);
    }
}

async function storeDetection(detection) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['detections'], (data) => {
            const detections = data.detections || [];
            detections.push(detection);
            
            if (detections.length > 100) {
                detections.splice(0, detections.length - 100);
            }
            
            chrome.storage.local.set({ detections }, resolve);
        });
    });
}

function updateDetectionStats(detections) {
    const total = detections.length;
    const fake = detections.filter(d => d.prediction === 'FAKE').length;
    const real = detections.filter(d => d.prediction === 'REAL').length;
    const suspicious = detections.filter(d => d.is_suspicious).length;
    
    document.getElementById('totalDetections').textContent = total;
    document.getElementById('fakeDetections').textContent = fake;
    document.getElementById('realDetections').textContent = real;
    document.getElementById('suspiciousDetections').textContent = suspicious;
}

function displayDetections(detections) {
    const listEl = document.getElementById('detectionList');
    
    if (detections.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                🎤<br>
                Start listening to begin!
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = detections.map(detection => {
        const time = new Date(detection.timestamp).toLocaleTimeString();
        const confidence = (detection.confidence * 100).toFixed(1);
        const className = detection.prediction === 'FAKE' ? 'fake' : 'real';
        const icon = detection.prediction === 'FAKE' ? '🚨' : '✅';
        
        return `
            <div class="detection-item ${className}">
                <div class="detection-header">
                    <div class="detection-time">${time}</div>
                    <div class="detection-confidence">${confidence}%</div>
                </div>
                <div class="detection-result">
                    ${icon} ${detection.prediction}
                </div>
                <div class="detection-source">
                    📡 ${detection.source || 'Unknown'}
                </div>
            </div>
        `;
    }).join('');
}

async function clearHistory() {
    const clearBtn = document.getElementById('clearBtn');
    const originalText = clearBtn.innerHTML;
    
    clearBtn.innerHTML = '<span class="loading"></span>';
    clearBtn.disabled = true;
    
    try {
        chrome.storage.local.set({ detections: [] });
        await loadDetectionHistory();
        
        clearBtn.innerHTML = '✅';
        setTimeout(() => {
            clearBtn.innerHTML = originalText;
            clearBtn.disabled = false;
        }, 1500);
        
    } catch (error) {
        console.error('Failed to clear history:', error);
        clearBtn.innerHTML = '❌';
        setTimeout(() => {
            clearBtn.innerHTML = originalText;
            clearBtn.disabled = false;
        }, 2000);
    }
}