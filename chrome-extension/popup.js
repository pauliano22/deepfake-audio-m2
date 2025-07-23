// Hide loading screen after animations complete
setTimeout(() => {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 600);
    }
}, 2500);

// popup.js - Simplified AI Voice Detector popup
let isMonitoring = false;
let currentPage = 'main';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 AI Voice Detector popup loaded - Simplified version');
    
    await checkAPIStatus();
    await checkCurrentState();
    
    // Set up main page event listeners
    document.getElementById('toggleBtn').addEventListener('click', toggleMonitoring);
    document.getElementById('historyBtn').addEventListener('click', showHistoryPage);
    
    // Set up history page event listeners
    document.getElementById('backBtn').addEventListener('click', showMainPage);
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
    
    // Auto-refresh current state every 3 seconds
    setInterval(() => {
        checkCurrentState();
        if (currentPage === 'history') {
            loadDetectionHistory();
        }
    }, 3000);
});

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
            updateUIForMonitoring(true);
        } else {
            isMonitoring = false;
            updateUIForMonitoring(false);
        }
        
    } catch (error) {
        isMonitoring = false;
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
            updateUIForMonitoring(false);
            
        } else {
            // Start monitoring
            btn.innerHTML = '<span class="loading"></span> Starting...';
            
            // Inject content script
            await injectContentScript(tab.id);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const response = await sendMessageToTab(tab.id, { action: 'startMonitoring' });
            
            if (response && response.success) {
                isMonitoring = true;
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
    
    if (monitoring) {
        btn.innerHTML = '⏹️ Stop Detection';
        btn.className = 'main-button danger';
        statusEl.className = 'status monitoring';
        statusEl.innerHTML = '🔄 Monitoring...';
    } else {
        btn.innerHTML = '🎙️ Start Detection';
        btn.className = 'main-button';
        
        if (statusEl.className !== 'status disconnected') {
            statusEl.className = 'status connected';
            statusEl.innerHTML = '✅ Ready';
        }
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
                    if (window.aiVoiceDetectorInjected && typeof stopScreenAudioCapture === 'function') {
                        console.log('🛑 Stopping existing monitoring...');
                        stopScreenAudioCapture();
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

function showHistoryPage() {
    document.getElementById('mainPage').classList.remove('active');
    document.getElementById('historyPage').classList.add('active');
    currentPage = 'history';
    loadDetectionHistory();
}

function showMainPage() {
    document.getElementById('historyPage').classList.remove('active');
    document.getElementById('mainPage').classList.add('active');
    currentPage = 'main';
}

async function loadDetectionHistory() {
    try {
        chrome.storage.local.get(['detections'], (data) => {
            const detections = data.detections || [];
            updateDetectionStats(detections);
            displayDetections(detections.slice(-20).reverse()); // Show last 20 detections
        });
    } catch (error) {
        console.error('Failed to load detection history:', error);
    }
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
                No detections yet.<br>
                Start monitoring to see results!
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = detections.map(detection => {
        const time = new Date(detection.timestamp).toLocaleTimeString();
        const date = new Date(detection.timestamp).toLocaleDateString();
        const confidence = (detection.confidence * 100).toFixed(1);
        const className = detection.prediction === 'FAKE' ? 'fake' : 'real';
        const icon = detection.prediction === 'FAKE' ? '🚨' : '✅';
        
        return `
            <div class="detection-item ${className}">
                <div class="detection-header">
                    <div class="detection-time">${date} ${time}</div>
                    <div class="detection-confidence">${confidence}%</div>
                </div>
                <div class="detection-result">
                    ${icon} ${detection.prediction === 'FAKE' ? 'AI VOICE' : 'REAL VOICE'}
                </div>
                <div class="detection-source">
                    🖥️ Screen Audio
                </div>
            </div>
        `;
    }).join('');
}

async function clearHistory() {
    const clearBtn = document.getElementById('clearBtn');
    const originalText = clearBtn.innerHTML;
    
    clearBtn.innerHTML = '<span class="loading"></span> Clearing...';
    clearBtn.disabled = true;
    
    try {
        chrome.storage.local.set({ detections: [] });
        await loadDetectionHistory();
        
        clearBtn.innerHTML = '✅ Cleared';
        setTimeout(() => {
            clearBtn.innerHTML = originalText;
            clearBtn.disabled = false;
        }, 1500);
        
    } catch (error) {
        console.error('Failed to clear history:', error);
        clearBtn.innerHTML = '❌ Error';
        setTimeout(() => {
            clearBtn.innerHTML = originalText;
            clearBtn.disabled = false;
        }, 2000);
    }
}