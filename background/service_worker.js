/**
 * Gemini Extended Suite - Service Worker (Manifest V3)
 * 通知、ストレージ初期化、バックグラウンド連携を管理
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Gemini Extended Suite] Extension installed / updated:', details.reason);

  const defaultSettings = {
    enableModelSwitcher: true,
    enableSkillLauncher: true,
    enableSidebarFolders: true,
    enableMarkdownExport: true,
    enableUsageMonitor: true,
    enableChatEnhancer: true,
    
    fullWidthMode: false,
    enableCharCount: true,
    enableDesktopNotifications: true,
    enableTableOfContents: true,

    exportIncludeThinking: true,
    selectedModel: 'flash-38',

    // 2026/10 Gemini公式スキル初期候補
    geminiOfficialSkills: [
      { id: 's-1', name: 'ディープリサーチ', icon: '🔍', desc: 'Web上の学術・公式ソースを横断調査' },
      { id: 's-2', name: '長編小説・シナリオ創作', icon: '📖', desc: 'プロット構成とキャラクター描写' },
      { id: 's-3', name: 'コードレビュー＆最適化', icon: '💻', desc: 'バグ検出・リファクタリング提案' },
      { id: 's-4', name: 'エグゼクティブ要約', icon: '⚡', desc: '長文・資料の要点箇条書き' }
    ],

    // フォルダ管理データ
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
