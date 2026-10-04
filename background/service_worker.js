/**
 * Gemini Extended Suite - Service Worker (Manifest V3)
 * 通知、ストレージ初期化、バックグラウンド連携を管理
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Gemini Extended Suite] Extension installed / updated:', details.reason);

  const defaultSettings = {
    enableModelSwitcher: true,
    enableSidebarFolders: true,
    enableMarkdownExport: true,
    enableUsageMonitor: true,
    enableChatEnhancer: true,
    
    fullWidthMode: false,
    enableCharCount: true,
    enableDesktopNotifications: true,
    enableTableOfContents: true,

    exportIncludeThinking: true,
    selectedModel: 'flash',
    thinkingEnabled: false,

    // フォルダ管理初期データ
    folders: [
      {
        id: 'folder-default-creative',
        name: '創作・ストーリー',
        icon: '📖',
        color: '#ff7b72',
        threadIds: [],
        isCollapsed: false
      },
      {
        id: 'folder-default-work',
        name: '業務・リサーチ',
        icon: '💼',
        color: '#79c0ff',
        threadIds: [],
        isCollapsed: false
      }
    ]
  };

  const stored = await chrome.storage.local.get(null);
  const toStore = {};

  for (const [key, value] of Object.entries(defaultSettings)) {
    if (stored[key] === undefined) {
      toStore[key] = value;
    }
  }

  if (Object.keys(toStore).length > 0) {
    await chrome.storage.local.set(toStore);
    console.log('[Gemini Extended Suite] Default settings initialized:', toStore);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_NOTIFICATION') {
    const { title, body, iconUrl } = message.payload;

    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl || chrome.runtime.getURL('icons/icon-128.png'),
      title: title || 'Gemini Extended Suite',
      message: body || 'AIの回答生成が完了しました。',
      priority: 1
    }, (notificationId) => {
      sendResponse({ success: true, notificationId });
    });

    return true;
  }

  if (message.type === 'GET_EXTENSION_INFO') {
    sendResponse({
      version: chrome.runtime.getManifest().version,
      platform: 'Chromium'
    });
    return true;
  }
});
