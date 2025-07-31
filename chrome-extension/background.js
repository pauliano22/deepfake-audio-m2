// background.js - Enhanced for voice and text detection
console.log('🎤 AI Voice + Text Detector background service worker loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('✅ AI Voice + Text Detector extension installed successfully');
});

// Handle notifications from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    if (message.type === 'showNotification') {
        try {
            chrome.notifications.create('ai-detection-' + Date.now(), {
                type: 'basic',
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                title: message.title || '🚨 AI Content Detected!',
                message: message.message
            });
        } catch (error) {
            console.log('Notification failed:', error);
        }
    }
    
    if (message.type === 'detectionResult') {
        console.log('Detection result received:', message.result);
    }
    
    if (message.type === 'streamingDetectionResult') {
        console.log('Streaming detection result:', message.result);
    }
    
    if (message.type === 'textDetectionResult') {
        console.log('Text detection result:', message.result);
    }
    
    sendResponse({ received: true });
    return true;
});