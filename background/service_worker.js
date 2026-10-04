/**
 * Gemini Extended Suite - Service Worker (Manifest V3)
 * 通知、ストレージ初期化、バックグラウンド使用状況同期タブ管理
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Gemini Extended Suite] Extension installed / updated:', details.reason);

  const defaultSettings = {
    enableSidebarFolders: true,
    enableMarkdownExport: true,
    enableUsageMonitor: true,
    enableChatEnhancer: true,
    
    fullWidthMode: false,
    enableCharCount: true,
    enableDesktopNotifications: true,
    enableTableOfContents: true,

    exportIncludeThinking: true,

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

let currentSyncTabId = null;
let syncTabSafetyTimer = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. デスクトップ通知
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

  // 2. 非アクティブ裏タブによる使用状況バックグラウンド自動同期
  if (message.type === 'SYNC_USAGE_BACKGROUND_TAB') {
    if (currentSyncTabId) {
      sendResponse({ status: 'already_syncing' });
      return true;
    }

    console.log('[Gemini Extended Suite Service Worker] Opening hidden tab for auto-sync...');
    
    // #g-ext-auto-sync ハッシュを付与して、アドオンによる自動起動であることを明示
    chrome.tabs.create({
      url: 'https://gemini.google.com/usage#g-ext-auto-sync',
      active: false
    }, (tab) => {
      currentSyncTabId = tab.id;

      clearTimeout(syncTabSafetyTimer);
      syncTabSafetyTimer = setTimeout(() => {
        if (currentSyncTabId) {
          console.log('[Gemini Extended Suite Service Worker] Safety timer: closing sync tab', currentSyncTabId);
          chrome.tabs.remove(currentSyncTabId).catch(() => {});
          currentSyncTabId = null;
        }
      }, 5000);

      sendResponse({ status: 'tab_created', tabId: tab.id });
    });

    return true;
  }

  // 3. /usage ページから同期完了通知を受け取った時（アドオン起動タブのみ閉じる）
  if (message.type === 'USAGE_SYNC_COMPLETE') {
    const senderTabId = sender.tab ? sender.tab.id : null;
    
    // アドオン自身が開いた同期タブ（currentSyncTabId）と一致する場合のみ閉じる！
    if (senderTabId && senderTabId === currentSyncTabId) {
      console.log('[Gemini Extended Suite Service Worker] Auto-sync complete. Closing background tab:', senderTabId);
      chrome.tabs.remove(senderTabId).catch(() => {});
      currentSyncTabId = null;
      clearTimeout(syncTabSafetyTimer);
    } else {
      console.log('[Gemini Extended Suite Service Worker] Manual user tab detected. Leaving open.');
    }

    sendResponse({ status: 'ok' });
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
