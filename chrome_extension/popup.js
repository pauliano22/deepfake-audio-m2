
let isMonitoring = false;
let serverUrl = 'http://localhost:8765';

document.addEventListener('DOMContentLoaded', async () => {
    await checkServerStatus();
    await loadDetections();
    
    document.getElementById('toggleBtn').addEventListener('click', toggleMonitoring);
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
    
    // Auto-refresh every 5 seconds
    setInterval(loadDetections, 5000);
});

async function checkServerStatus() {
    try {
        const response = await fetch(`${serverUrl}/api/status`);
        const data = await response.json();
        
        const statusEl = document.getElementById('status');
        if (data.status === 'running') {
            statusEl.className = 'status active';
            statusEl.textContent = '✅ Server Connected';
        }
    } catch (error) {
        const statusEl = document.getElementById('status');
        statusEl.className = 'status inactive';
        statusEl.textContent = '❌ Server Disconnected';
    }
}

async function toggleMonitoring() {
    const btn = document.getElementById('toggleBtn');
    
    if (isMonitoring) {
        // Stop monitoring
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'stopMonitoring'});
        });
        btn.textContent = 'Start Monitoring';
        isMonitoring = false;
    } else {
        // Start monitoring
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'startMonitoring'});
        });
        btn.textContent = 'Stop Monitoring';
        isMonitoring = true;
    }
}

async function loadDetections() {
    try {
        const response = await fetch(`${serverUrl}/api/history`);
        const data = await response.json();
        
        const listEl = document.getElementById('detectionList');
        
        if (data.detections.length === 0) {
            listEl.innerHTML = 'No detections yet';
            return;
        }
        
        listEl.innerHTML = data.detections.slice(-5).map(detection => {
            const time = new Date(detection.timestamp).toLocaleTimeString();
            const confidence = (detection.confidence * 100).toFixed(1);
            const className = detection.prediction === 'FAKE' ? 'fake' : 'real';
            
            return `<div class="detection ${className}">
                ${time}: ${detection.prediction} (${confidence}%)
                <br><small>${detection.source}</small>
            </div>`;
        }).join('');
        
    } catch (error) {
        console.error('Failed to load detections:', error);
    }
}

async function clearHistory() {
    try {
        await fetch(`${serverUrl}/api/clear_history`, {method: 'POST'});
        await loadDetections();
    } catch (error) {
        console.error('Failed to clear history:', error);
    }
}
