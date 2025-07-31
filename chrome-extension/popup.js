// popup.js - Enhanced with text detection controls

let isMonitoring = false;
let textDetectionEnabled = true;
let currentPage = 'main';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 AI Voice + Text Detector popup loaded');
    
    await checkAPIStatus();
    await checkCurrentState();
    await checkTextDetectionState();
    
    // Set up main page event listeners
    document.getElementById('toggleBtn').addEventListener('click', toggleMonitoring);
    document.getElementById('historyBtn').addEventListener('click', showHistoryPage);
    document.getElementById('textToggle').addEventListener('click', toggleTextDetection);
    document.getElementById('voiceToggle').addEventListener('click', toggleVoiceDetection);
    
    // Set up history page event listeners
    document.getElementById('backBtn').addEventListener('click', showMainPage);
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
    
    // Auto-refresh current state every 3 seconds
    setInterval(() => {
        checkCurrentState();
        checkTextDetectionState();
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
            updateVoiceToggle(true);
            updateUIForMonitoring(true);
        } else {
            isMonitoring = false;
            updateVoiceToggle(false);
            updateUIForMonitoring(false);
        }
        
    } catch (error) {
        isMonitoring = false;
        updateVoiceToggle(false);
        updateUIForMonitoring(false);
    }
}

async function checkTextDetectionState() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;
        
        const response = await sendMessageToTab(tab.id, { action: 'getTextDetectionState' });
        
        if (response && typeof response.textDetectionEnabled === 'boolean') {
            textDetectionEnabled = response.textDetectionEnabled;
        }
        
        updateTextToggle(textDetectionEnabled);
        
    } catch (error) {
        // Default to enabled
        textDetectionEnabled = true;
        updateTextToggle(true);
    }
}

async function toggleTextDetection() {
    const textToggle = document.getElementById('textToggle');
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.id) {
            throw new Error('Please open a website first, then try again.');
        }
        
        // Try to inject content script if not already injected
        try {
            await injectContentScript(tab.id);
        } catch (injectError) {
            // Content script might already be injected, continue
        }
        
        const response = await sendMessageToTab(tab.id, { action: 'toggleTextDetection' });
        
        if (response && response.success) {
            textDetectionEnabled = response.textDetectionEnabled;
            updateTextToggle(textDetectionEnabled);
            
            // Show feedback
            const statusEl = document.getElementById('status');
            const originalClass = statusEl.className;
            const originalHTML = statusEl.innerHTML;
            
            statusEl.className = 'status connected';
            statusEl.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                    <path d="m9 12 2 2 4-4"/>
                    <circle cx="12" cy="12" r="9"/>
                </svg>
                Text Detection ${textDetectionEnabled ? 'On' : 'Off'}
            `;
            
            setTimeout(() => {
                statusEl.className = originalClass;
                statusEl.innerHTML = originalHTML;
            }, 2000);
        }
        
    } catch (error) {
        console.error('Failed to toggle text detection:', error);
        
        // Show error feedback
        const statusEl = document.getElementById('status');
        const originalClass = statusEl.className;
        const originalHTML = statusEl.innerHTML;
        
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Please refresh page
        `;
        
        setTimeout(() => {
            statusEl.className = originalClass;
            statusEl.innerHTML = originalHTML;
        }, 3000);
    }
}

async function toggleVoiceDetection() {
    // Voice detection toggle has same behavior as main button
    await toggleMonitoring();
}

function updateTextToggle(enabled) {
    const textToggle = document.getElementById('textToggle');
    if (enabled) {
        textToggle.classList.add('active');
    } else {
        textToggle.classList.remove('active');
    }
}

function updateVoiceToggle(enabled) {
    const voiceToggle = document.getElementById('voiceToggle');
    if (enabled) {
        voiceToggle.classList.add('active');
    } else {
        voiceToggle.classList.remove('active');
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
            updateVoiceToggle(false);
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
                updateVoiceToggle(true);
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
        updateVoiceToggle(false);
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
            <span>Stop Voice Detection</span>
        `;
        btn.className = 'main-button danger';
        statusEl.className = 'status monitoring';
        statusEl.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;">
                <circle cx="12" cy="12" r="10"/>
                <path d="m9 12 2 2 4-4"/>
            </svg>
            Voice Monitoring...
        `;
    } else {
        btn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span>Start Voice Detection</span>
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
        console.log('🔄 Injecting enhanced content script into tab:', tabId);
        
        // Cleanup existing monitoring
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    if (window.aiVoiceDetectorCleanup && typeof window.aiVoiceDetectorCleanup === 'function') {
                        console.log('🛑 Stopping existing monitoring...');
                        window.aiVoiceDetectorCleanup();
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
        
        console.log('✅ Enhanced content script injected successfully');
        
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
        chrome.storage.local.get(['detections', 'textDetections'], (data) => {
            const voiceDetections = data.detections || [];
            const textDetections = data.textDetections || [];
            
            // Combine and sort by timestamp
            const allDetections = [
                ...voiceDetections.map(d => ({ ...d, type: 'voice' })),
                ...textDetections.map(d => ({ ...d, type: 'text' }))
            ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            updateDetectionStats(voiceDetections, textDetections);
            displayDetections(allDetections.slice(0, 20)); // Show last 20 detections
        });
    } catch (error) {
        console.error('Failed to load detection history:', error);
    }
}

function updateDetectionStats(voiceDetections, textDetections) {
    const allDetections = [...voiceDetections, ...textDetections];
    const total = allDetections.length;
    const fake = allDetections.filter(d => d.prediction === 'FAKE' || d.prediction === 'AI').length;
    const real = allDetections.filter(d => d.prediction === 'REAL' || d.prediction === 'HUMAN').length;
    const suspicious = allDetections.filter(d => d.is_suspicious || d.confidence > 0.7).length;
    
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
                Start monitoring or hover over text to see results!
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = detections.map(detection => {
        const time = new Date(detection.timestamp).toLocaleTimeString();
        const date = new Date(detection.timestamp).toLocaleDateString();
        const confidence = (detection.confidence * 100).toFixed(1);
        
        // Determine if AI/Fake
        const isAI = detection.prediction === 'FAKE' || detection.prediction === 'AI';
        const className = isAI ? 'fake' : 'real';
        
        // Get appropriate icon and label
        let icon, label, sourceIcon, sourceLabel;
        
        if (detection.type === 'voice') {
            sourceIcon = '<svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px; stroke: #FF6B35;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
            sourceLabel = 'Voice Detection';
            icon = isAI ? 
                '<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px; stroke: #DC2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' : 
                '<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px; stroke: #00ff00;"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>';
            label = isAI ? 'AI Voice' : 'Real Voice';
        } else {
            sourceIcon = '<svg class="icon" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px; stroke: #3498db;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>';
            sourceLabel = 'Text Detection';
            icon = isAI ? 
                '<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px; stroke: #DC2626;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V6a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V12a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' : 
                '<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px; stroke: #00ff00;"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>';
            label = isAI ? 'AI Generated Text' : 'Human Written Text';
        }
        
        return `
            <div class="detection-item ${className}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 11px; opacity: 0.7; color: #c0392b;">${date} ${time}</div>
                    <div style="background: linear-gradient(135deg, rgba(192, 57, 43, 0.15), rgba(192, 57, 43, 0.1)); border: 1px solid rgba(192, 57, 43, 0.3); color: #e8e8e8; padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: 500; letter-spacing: 1px;">${confidence}%</div>
                </div>
                <div style="font-weight: 400; font-size: 13px; margin-bottom: 4px; color: #e8e8e8; letter-spacing: 0.3px;">
                    ${icon} ${label}
                </div>
                <div style="font-size: 11px; opacity: 0.7; color: #c0392b;">
                    ${sourceIcon} ${sourceLabel}
                </div>
                ${detection.reasoning ? `<div style="font-size: 10px; opacity: 0.6; color: #b0b0b0; margin-top: 4px; font-style: italic;">${detection.reasoning}</div>` : ''}
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
        chrome.storage.local.set({ detections: [], textDetections: [] });
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