
// Background service worker for Chrome extension

chrome.runtime.onInstalled.addListener(() => {
    console.log('Deepfake Detector extension installed');
});

// Handle notifications
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'showNotification') {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Deepfake Detected!',
            message: request.message
        });
    }
});
