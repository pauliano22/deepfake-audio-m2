// background.js - Pure JavaScript version
console.log('🎤 AI Voice Detector background service worker loaded - Pure JS');

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('✅ AI Voice Detector extension installed successfully');
});

// Handle notifications from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    if (message.type === 'showNotification') {
        try {
            chrome.notifications.create('deepfake-' + Date.now(), {
                type: 'basic',
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                title: '🚨 Deepfake Detected!',
                message: message.message
            });
        } catch (error) {
            console.log('Notification failed:', error);
        }
    }
    
    if (message.type === 'detectionResult') {
        console.log('Detection result received:', message.result);
    }
    
    sendResponse({ received: true });
    return true;
});