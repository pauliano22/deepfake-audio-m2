// background.js - SIMPLIFIED Chrome Extension Background Service Worker

console.log('🎤 AI Voice Detector background service worker loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('✅ AI Voice Detector extension installed successfully');
});

// Handle notifications from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'showNotification') {
        chrome.notifications.create({
            type: 'basic',
            title: '🚨 Deepfake Detected!',
            message: message.message
        }).catch(error => {
            console.log('Notification failed:', error);
        });
    }
    
    if (message.type === 'detectionResult') {
        console.log('Detection result received:', message.result);
    }
    
    // Important: Always send a response
    sendResponse({ received: true });
});