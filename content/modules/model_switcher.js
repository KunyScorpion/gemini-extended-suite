/**
 * Gemini Extended Suite - Feature 1: モデル選択ワンタッチバー
 * チャット入力ボックス直上にピル型ボタンを配置し、ワンクリックでモデルを切り替え
 */

class ModelSwitcherModule {
  constructor() {
    this.containerId = 'g-ext-model-bar-root';
    this.models = [
      { id: 'flash', name: 'Gemini 2.5 Flash', tag: 'Fast', keywords: ['flash', '高速'] },
      { id: 'pro', name: 'Gemini 2.5 Pro', tag: 'Pro', keywords: ['pro', '高度'] },
      { id: 'thinking', name: 'Gemini 2.5 Thinking', tag: 'Reasoning', keywords: ['thinking', '思考', 'deep'] },
      { id: 'flagship', name: 'Gemini 3.0 Ultra', tag: 'Flagship', keywords: ['ultra', 'flagship', '3.0'] }
    ];
    this.currentModelId = 'flash';
    this.enabled = true;
  }

  async init() {
    const settings = await chrome.storage.local.get(['enableModelSwitcher', 'selectedModel']);
    this.enabled = settings.enableModelSwitcher !== false;
    if (settings.selectedModel) {
      this.currentModelId = settings.selectedModel;
    }
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const existing = document.getElementById(this.containerId);
    if (existing) {
      // 既存UIがある場合、アクティブ状態を再同期
      this.syncActiveState();
      return;
    }

    // チャット入力欄のコンテナを探索
    const inputContainer = this.findInputContainer();
    if (!inputContainer) return;

    this.mountUI(inputContainer);
  }

  findInputContainer() {
    // 2026/Post-Gemini 入力コンテナのセレクタ候補
    const selectors = [
      '.input-area-container',
      '.chat-input-container',
      'rich-textarea',
      '[class*="input-box"]',
      '[class*="bottom-container"]',
      'footer',
      'form[class*="query"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        // 入力親要素または直前
        return el.parentElement || el;
      }
    }
    return null;
  }

  mountUI(parent) {
    const bar = document.createElement('div');
    bar.id = this.containerId;
    bar.className = 'g-ext-model-bar-container';

    const label = document.createElement('span');
    label.className = 'g-ext-model-bar-label';
    label.textContent = '⚡ MODEL:';
    bar.appendChild(label);

    this.models.forEach((m) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `g-ext-model-pill ${m.id === this.currentModelId ? 'active' : ''}`;
      pill.dataset.modelId = m.id;

      const dot = document.createElement('span');
      dot.className = 'g-ext-model-pill-dot';

      const text = document.createElement('span');
      text.textContent = m.name;

      pill.appendChild(dot);
      pill.appendChild(text);

      pill.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectModel(m);
      });

      bar.appendChild(pill);
    });

    // 入力エリアの手前に挿入
    parent.insertBefore(bar, parent.firstChild);
    console.log('[Gemini Extended Suite] Model Switcher Bar mounted');
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  syncActiveState() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 公式UIの現在の選択テキストを検出
    const officialSelector = document.querySelector('[aria-label*="モデル"], [data-test-id*="model"], .model-selector-button');
    if (officialSelector) {
      const text = (officialSelector.textContent || '').toLowerCase();
      const matched = this.models.find(m => m.keywords.some(k => text.includes(k)));
      if (matched && matched.id !== this.currentModelId) {
        this.currentModelId = matched.id;
      }
    }

    container.querySelectorAll('.g-ext-model-pill').forEach(pill => {
      if (pill.dataset.modelId === this.currentModelId) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  async selectModel(model) {
    this.currentModelId = model.id;
    chrome.storage.local.set({ selectedModel: model.id });
    this.syncActiveState();

    console.log(`[Gemini Extended Suite] Switching model to: ${model.name}`);

    // 公式UIのドロップダウンメニュー操作をシミュレーション
    await this.triggerOfficialModelSwitch(model);
  }

  async triggerOfficialModelSwitch(model) {
    // 1. 公式ドロップダウントリガーボタンを探す
    const triggers = Array.from(document.querySelectorAll('button, div[role="button"]'))
      .filter(el => {
        const label = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
        return label.includes('model') || label.includes('モデル') || el.getAttribute('aria-haspopup') === 'menu';
      });

    const trigger = triggers[0];
    if (!trigger) {
      console.warn('[Gemini Extended Suite] Official model trigger not found, simulating fallback');
      return;
    }

    // ドロップダウンを開く
    trigger.click();
    await new Promise(r => setTimeout(r, 120));

    // メニュー項目から対象モデルを探す
    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], mat-option, div[class*="menu-item"]'));
    const targetItem = menuItems.find(item => {
      const text = (item.textContent || '').toLowerCase();
      return model.keywords.some(k => text.includes(k));
    });

    if (targetItem) {
      targetItem.click();
      console.log(`[Gemini Extended Suite] Successfully triggered official switch for ${model.name}`);
    } else {
      // 該当なしの場合はメニューを閉じる
      trigger.click();
    }
  }
}

// 登録
window.modelSwitcherModule = new ModelSwitcherModule();
window.modelSwitcherModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('modelSwitcher', window.modelSwitcherModule);
  }
});
