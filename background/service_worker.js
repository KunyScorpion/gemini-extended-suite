/**
 * Gemini Extended Suite - Service Worker (Manifest V3)
 * 通知、ストレージ初期化、バックグラウンド連携を管理
 */

// インストール時のデフォルト設定初期化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Gemini Extended Suite] Extension installed / updated:', details.reason);

  const defaultSettings = {
    // 機能有効・無効フラグ
    enableModelSwitcher: true,
    enableSkillLauncher: true,
    enableSidebarFolders: true,
    enableMarkdownExport: true,
    enableUsageMonitor: true,
    enableChatEnhancer: true,
    
    // チャット快適化オプション
    fullWidthMode: false,
    enableCharCount: true,
    enableDesktopNotifications: true,
    enableTableOfContents: true,

    // MDエクスポート設定
    exportIncludeThinking: true,

    // デフォルト登録スキルリスト（2026年Post-Gemアーキテクチャ対応）
    skills: [
      {
        id: 'skill-research',
        name: 'ディープリサーチ',
        icon: '🔍',
        command: '/skill:research ',
        description: '信頼性の高い学術論文・公式ソースを横断調査し論理的にまとめます'
      },
      {
        id: 'skill-plot',
        name: '創作プロット設計',
        icon: '📖',
        command: '/skill:story-plot ',
        description: '三幕構成とキャラクター動線に基づいた長編小説・シナリオの骨子を作成'
      },
      {
        id: 'skill-code',
        name: 'コードレビュー＆リファクタ',
        icon: '💻',
        command: '/skill:code-review ',
        description: 'セキュリティ脆弱性・パフォーマンス・可読性を多角的に検証'
      },
      {
        id: 'skill-summary',
        name: '超要約・重要論点抽出',
        icon: '⚡',
        command: '/skill:executive-summary ',
        description: '長文を箇条書き3点と要約、Next Actionに即時整理'
      },
      {
        id: 'skill-translate',
        name: '文脈適合翻訳（日英）',
        icon: '🌐',
        command: '/skill:context-translate ',
        description: '自然なニュアンスと業界用語を保った高精度バイリンガル翻訳'
      }
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

// メッセージリスナー
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

    return true; // 非同期レスポンス維持
  }

  if (message.type === 'GET_EXTENSION_INFO') {
    sendResponse({
      version: chrome.runtime.getManifest().version,
      platform: 'Chromium'
    });
    return true;
  }
});
