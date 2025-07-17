// popup.js - FIXED Chrome Extension Popup Logic
let isMonitoring = false;
const SERVER_URL = 'http://localhost:8765';

// Initialize popup when DOM loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 AI Voice Detector popup loaded');
    
    await checkServerStatus();
    await loadDetectionHistory();
    
    // Set up event listeners
    document.getElementById('toggleBtn').addEventListener('click', toggleMonitoring);
    document.getElementById('testBtn').addEventListener('click', testDetection);
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
    
    // Auto-refresh detection history every 5 seconds
    setInterval(loadDetectionHistory, 5000);
});

async function checkServerStatus() {
    const statusEl = document.getElementById('status');
    
    try {
        const response = await fetch(`${SERVER_URL}/api/status`);
        const data = await response.json();
        
        if (data.status === 'running') {
            statusEl.className = 'status connected';
            statusEl.innerHTML = '✅ Server Connected';
        }
    } catch (error) {
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = '❌ Start Python Server';
        console.log('Server not running. Run: python chrome_extension_server.py');
    }
}

async function toggleMonitoring() {
    const btn = document.getElementById('toggleBtn');
    const statusEl = document.getElementById('status');
    
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.id) {
            throw new Error('No active tab found');
        }
        
        console.log('Sending message to tab:', tab.id);
        
        if (isMonitoring) {
            // Stop monitoring
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'stopMonitoring' });
            console.log('Stop monitoring response:', response);
            
            isMonitoring = false;
            btn.innerHTML = '🎙️ Start Monitoring';
            btn.className = 'btn-primary';
            statusEl.className = 'status connected';
            statusEl.innerHTML = '✅ Server Connected';
            
        } else {
            // Start monitoring
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'startMonitoring' });
            console.log('Start monitoring response:', response);
            
            if (response && response.success) {
                isMonitoring = true;
                btn.innerHTML = '⏹️ Stop Monitoring';
                btn.className = 'btn-danger';
                statusEl.className = 'status monitoring';
                statusEl.innerHTML = '🔄 Monitoring Audio...';
            } else {
                throw new Error(response?.error || 'Failed to start monitoring');
            }
        }
        
    } catch (error) {
        console.error('Failed to toggle monitoring:', error);
        
        // Check if it's a content script issue
        if (error.message.includes('Receiving end does not exist')) {
            statusEl.className = 'status disconnected';
            statusEl.innerHTML = '❌ Refresh page & try again';
        } else {
            statusEl.className = 'status disconnected';
            statusEl.innerHTML = '❌ ' + error.message;
        }
        
        btn.innerHTML = '🎙️ Start Monitoring';
        btn.className = 'btn-primary';
        isMonitoring = false;
    }
}

async function testDetection() {
    const testBtn = document.getElementById('testBtn');
    const originalText = testBtn.innerHTML;
    
    testBtn.innerHTML = '<span class="loading"></span> Testing...';
    testBtn.disabled = true;
    
    try {
        const response = await fetch(`${SERVER_URL}/api/test`, {
            method: 'POST'
        });
        
        if (response.ok) {
            const result = await response.json();
            await loadDetectionHistory();
            
            // Show notification (remove iconUrl to avoid icon errors)
            chrome.notifications.create({
                type: 'basic',
                title: '🧪 Test Detection',
                message: `${result.prediction} detected (${(result.confidence * 100).toFixed(1)}% confidence)`
            }).catch(error => {
                console.log('Notification failed:', error);
            });
        }
        
    } catch (error) {
        console.error('Test detection failed:', error);
    } finally {
        testBtn.innerHTML = originalText;
        testBtn.disabled = false;
    }
}

async function loadDetectionHistory() {
    try {
        const response = await fetch(`${SERVER_URL}/api/history`);
        
        if (!response.ok) return; // Server not running
        
        const data = await response.json();
        const detections = data.detections || [];
        
        updateDetectionStats(detections);
        displayDetections(detections.slice(-5)); // Show last 5 detections
        
    } catch (error) {
        // Server not running, ignore
    }
}

function updateDetectionStats(detections) {
    const total = detections.length;
    const fake = detections.filter(d => d.prediction === 'FAKE').length;
    const real = detections.filter(d => d.prediction === 'REAL').length;
    
    document.getElementById('totalDetections').textContent = total;
    document.getElementById('fakeDetections').textContent = fake;
    document.getElementById('realDetections').textContent = real;
}

function displayDetections(detections) {
    const listEl = document.getElementById('detectionList');
    
    if (detections.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; color: rgba(255,255,255,0.6); font-size: 12px; padding: 20px;">
                No detections yet. Start monitoring!
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = detections.reverse().map(detection => {
        const time = new Date(detection.timestamp).toLocaleTimeString();
        const confidence = (detection.confidence * 100).toFixed(1);
        const className = detection.prediction === 'FAKE' ? 'fake' : 'real';
        const icon = detection.prediction === 'FAKE' ? '🚨' : '✅';
        
        return `
            <div class="detection-item ${className}">
                <div style="font-weight: 600; margin-bottom: 4px;">${time}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${icon} ${detection.prediction}</strong><br>
                        <small style="opacity: 0.8;">${detection.source || 'Web Audio'}</small>
                    </div>
                    <div style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                        ${confidence}%
                    </div>
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
        await fetch(`${SERVER_URL}/api/clear_history`, { method: 'POST' });
        await loadDetectionHistory();
        
        const statusEl = document.getElementById('status');
        const originalStatus = statusEl.innerHTML;
        statusEl.innerHTML = '🗑️ History Cleared';
        
        setTimeout(() => {
            statusEl.innerHTML = originalStatus;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to clear history:', error);
    } finally {
        clearBtn.innerHTML = originalText;
        clearBtn.disabled = false;
    }
}