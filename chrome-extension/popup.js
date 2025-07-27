// popup.js - User-friendly error messages

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
        statusEl.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <path d="m9 12 2 2 4-4"/>
                <circle cx="12" cy="12" r="9"/>
            </svg>
            Ready
        `;
        
    } catch (error) {
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Connection Issue
        `;
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
            throw new Error('Please open a website first, then try again.');
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
                throw new Error(response?.error || 'Unable to start detection. Please try refreshing the page.');
            }
        }
        
    } catch (error) {
        console.error('Failed to toggle monitoring:', error);
        
        // User-friendly error messages
        let userMessage = error.message;
        
        if (error.message.includes('Cannot access')) {
            userMessage = 'This page cannot be monitored. Please try a different website like YouTube or Netflix.';
        } else if (error.message.includes('chrome://') || error.message.includes('chrome-extension://')) {
            userMessage = 'Chrome system pages cannot be monitored. Please open a regular website.';
        } else if (error.message.includes('Could not establish connection')) {
            userMessage = 'Please refresh the page and try again.';
        } else if (error.message.includes('inject')) {
            userMessage = 'Unable to start on this page. Please try a different website.';
        } else if (error.message.includes('Permission denied')) {
            userMessage = 'Screen sharing permission needed. Please allow when prompted.';
        } else if (error.message.includes('cancelled') || error.message.includes('AbortError')) {
            userMessage = 'Screen sharing was cancelled. Please try again and click "Share".';
        } else if (error.message.includes('NotSupported')) {
            userMessage = 'Your browser doesn\'t support this feature. Please use Chrome or Edge.';
        } else if (error.message.includes('timeout') || error.message.includes('network')) {
            userMessage = 'Connection timeout. Please check your internet and try again.';
        }
        
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            ${userMessage}
        `;
        
        isMonitoring = false;
        updateUIForMonitoring(false);
        
        setTimeout(() => {
            if (!isMonitoring) {
                statusEl.className = 'status connected';
                statusEl.innerHTML = `
                    <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                        <path d="m9 12 2 2 4-4"/>
                        <circle cx="12" cy="12" r="9"/>
                    </svg>
                    Ready
                `;
            }
        }, 5000);
        
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
        btn.innerHTML = `
            <svg class="icon">
                <rect x="2" y="0" width="4" height="16"/>
                <rect x="10" y="0" width="4" height="16"/>
            </svg>
            <span>Stop Detection</span>
        `;
        btn.className = 'main-button danger';
        statusEl.className = 'status monitoring';
        statusEl.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <circle cx="12" cy="12" r="10"/>
                <path d="m9 12 2 2 4-4"/>
            </svg>
            Monitoring...
        `;
    } else {
        btn.innerHTML = `
            <svg class="icon icon-large" viewBox="0 0 24 24">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span>Start Detection</span>
        `;
        btn.className = 'main-button';
        
        if (statusEl.className !== 'status disconnected') {
            statusEl.className = 'status connected';
            statusEl.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                    <path d="m9 12 2 2 4-4"/>
                    <circle cx="12" cy="12" r="9"/>
                </svg>
                Ready
            `;
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
        
        // User-friendly error handling
        if (error.message.includes('Cannot access')) {
            throw new Error('This page cannot be monitored. Please try a different website like YouTube or Netflix.');
        } else if (error.message.includes('chrome://') || error.message.includes('chrome-extension://')) {
            throw new Error('Chrome system pages cannot be monitored. Please open a regular website.');
        } else if (error.message.includes('Receiving end does not exist')) {
            throw new Error('Please refresh the page and try again.');
        } else {
            throw new Error('Unable to start on this page. Please try a different website.');
        }
    }
}

async function sendMessageToTab(tabId, message) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch (error) {
        if (error.message.includes('Could not establish connection')) {
            throw new Error('Please refresh the page and try again.');
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
                <svg class="icon" viewBox="0 0 24 24" style="width: 24px; height: 24px; margin-bottom: 8px; stroke: #666;">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                    <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                </svg><br>
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
        const icon = detection.prediction === 'FAKE' ? 
            '<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px; stroke: #DC2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' : 
            '<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px; stroke: #00ff00;"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>';
        
        return `
            <div class="detection-item ${className}">
                <div class="detection-header">
                    <div class="detection-time">${date} ${time}</div>
                    <div class="detection-confidence">${confidence}%</div>
                </div>
                <div class="detection-result">
                    ${icon} ${detection.prediction === 'FAKE' ? 'AI Voice' : 'Real Voice'}
                </div>
                <div class="detection-source">
                    <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px; stroke: #FF6B35;">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    Screen Audio
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
        
        clearBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <path d="m9 12 2 2 4-4"/>
                <circle cx="12" cy="12" r="9"/>
            </svg>
            Cleared
        `;
        setTimeout(() => {
            clearBtn.innerHTML = originalText;
            clearBtn.disabled = false;
        }, 1500);
        
    } catch (error) {
        console.error('Failed to clear history:', error);
        clearBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Error
        `;
        setTimeout(() => {
            clearBtn.innerHTML = originalText;
            clearBtn.disabled = false;
        }, 2000);
    }
}