/**
 * Gemini Extended Suite - Feature 1: モデル選択ワンタッチバー
 * 2026年10月最新Web版Geminiモデル（3.8 Flash / 3.1 Pro / 4 Argon / Thinking）対応
 * チャット入力ボックス直上にピル型ボタンを配置し、ワンクリックでモデルを切り替え
 */

class ModelSwitcherModule {
  constructor() {
    this.containerId = 'g-ext-model-bar-root';
    // 2026年10月最新Web版Geminiモデル一覧
    this.models = [
      {
        id: 'flash-38',
        name: 'Gemini 3.8 Flash',
        tag: 'Fast',
        badge: '⚡',
        keywords: ['3.8 flash', 'flash', '高速']
      },
      {
        id: 'pro-31',
        name: 'Gemini 3.1 Pro',
        tag: 'Pro',
        badge: '🧠',
        keywords: ['3.1 pro', 'pro', '高度']
      },
      {
        id: 'argon-4',
        name: 'Gemini 4 Argon',
        tag: 'Frontier',
        badge: '✨',
        keywords: ['4 argon', 'argon', '4.0', 'ultra', 'フロンティア', 'frontier']
      },
      {
        id: 'thinking-38',
        name: 'Gemini 3.8 Thinking',
        tag: 'Reasoning',
        badge: '💭',
        keywords: ['thinking', '思考', 'high', 'deep', 'extended thinking']
      }
    ];
    this.currentModelId = 'flash-38';
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
      this.syncActiveState();
      return;
    }

    const inputContainer = this.findInputContainer();
    if (!inputContainer) return;

    this.mountUI(inputContainer);
  }

  findInputContainer() {
    const selectors = [
      '.input-area-container',
      '.chat-input-container',
      'rich-textarea',
      '[class*="input-box"]',
      '[class*="bottom-container"]',
      'form[class*="query"]',
      'footer',
      '[role="region"][aria-label*="プロンプト"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
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
      pill.title = `${m.name} (${m.tag})`;

      const badge = document.createElement('span');
      badge.textContent = m.badge;
      badge.style.fontSize = '12px';

      const dot = document.createElement('span');
      dot.className = 'g-ext-model-pill-dot';

      const text = document.createElement('span');
      text.textContent = m.name;

      pill.appendChild(badge);
      pill.appendChild(dot);
      pill.appendChild(text);

      pill.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectModel(m);
      });

      bar.appendChild(pill);
    });

    parent.insertBefore(bar, parent.firstChild);
    this.syncActiveState();
    console.log('[Gemini Extended Suite] 2026/10 Model Switcher Bar mounted');
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  syncActiveState() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 公式UIの現在の選択テキストを検出
    const officialSelectors = [
      '[aria-label*="モデル"]',
      '[data-test-id*="model"]',
      '.model-selector-button',
      '[class*="model-pill"]',
      'button[aria-haspopup="menu"]:has([class*="model"])'
    ];

    for (const sel of officialSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
        const matched = this.models.find(m => m.keywords.some(k => text.includes(k)));
        if (matched && matched.id !== this.currentModelId) {
          this.currentModelId = matched.id;
          break;
        }
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
    await this.triggerOfficialModelSwitch(model);
  }

  async triggerOfficialModelSwitch(model) {
    // 1. 公式ドロップダウントリガーボタンを探す
    const triggers = Array.from(document.querySelectorAll('button, div[role="button"]'))
      .filter(el => {
        const label = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
        return (label.includes('model') || label.includes('モデル') || label.includes('gemini') || label.includes('flash') || label.includes('pro'))
          && (el.getAttribute('aria-haspopup') === 'menu' || el.getAttribute('aria-expanded') !== null || el.classList.value.includes('selector'));
      });

    const trigger = triggers[0] || document.querySelector('[aria-label*="モデル"], [data-test-id*="model-picker"]');
    if (!trigger) {
      console.warn('[Gemini Extended Suite] Official model trigger not found in DOM');
      return;
    }

    try {
      trigger.click();
      await new Promise(r => setTimeout(r, 150));

      const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], mat-option, div[class*="menu-item"], div[class*="item"]'));
      const targetItem = menuItems.find(item => {
        const text = (item.textContent || '').toLowerCase();
        return model.keywords.some(k => text.includes(k));
      });

      if (targetItem) {
        targetItem.click();
        console.log(`[Gemini Extended Suite] Selected model menu item for ${model.name}`);
      } else {
        // メニュー外クリックで閉じる
        document.body.click();
      }
    } catch (err) {
      console.error('[Gemini Extended Suite] Error during model switch simulation:', err);
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
