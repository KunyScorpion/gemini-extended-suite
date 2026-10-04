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

// バックグラウンド同期中タブIDの追跡
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
    // 既に同期タブが実行中の場合は二重起動を防ぐ
    if (currentSyncTabId) {
      sendResponse({ status: 'already_syncing' });
      return true;
    }

    console.log('[Gemini Extended Suite Service Worker] Creating hidden background tab for /usage sync...');
    
    chrome.tabs.create({
      url: 'https://gemini.google.com/usage',
      active: false // ユーザーの画面を切り替えずに裏で開く
    }, (tab) => {
      currentSyncTabId = tab.id;

      // セーフティタイマー（万が一応答がなくても最大5秒で確実に閉じる）
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

  // 3. /usage ページから同期完了通知を受け取った時
  if (message.type === 'USAGE_SYNC_COMPLETE') {
    const tabToClose = sender.tab ? sender.tab.id : currentSyncTabId;
    if (tabToClose) {
      console.log('[Gemini Extended Suite Service Worker] Usage sync complete, closing tab:', tabToClose);
      chrome.tabs.remove(tabToClose).catch(() => {});
      if (tabToClose === currentSyncTabId) {
        currentSyncTabId = null;
        clearTimeout(syncTabSafetyTimer);
      }
    }
    sendResponse({ status: 'closed' });
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
