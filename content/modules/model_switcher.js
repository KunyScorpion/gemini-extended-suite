/**
 * Gemini Extended Suite - Feature 1: ミニマル・モデル＆思考モード選択バー
 * 画像2の実装モデル（3.5 Flash-Lite / 3.8 Flash / 3.1 Pro ＋ 強化版思考モード）に完全準拠
 * 邪魔にならないコンパクト・スリム設計
 */

class ModelSwitcherModule {
  constructor() {
    this.containerId = 'g-ext-model-bar-root';
    
    // 画像2に基づくモデル一覧
    this.models = [
      { id: 'flash-lite', name: '3.5 Lite', fullName: '3.5 Flash-Lite', keywords: ['3.5 flash-lite', 'flash-lite', 'lite'] },
      { id: 'flash', name: '3.8 Flash', fullName: '3.8 Flash', keywords: ['3.8 flash', '3.8', 'flash'] },
      { id: 'pro', name: '3.1 Pro', fullName: '3.1 Pro', keywords: ['3.1 pro', '3.1', 'pro'] }
    ];

    this.currentModelId = 'flash';
    this.isThinkingEnabled = false;
    this.enabled = true;
  }

  async init() {
    const settings = await chrome.storage.local.get(['enableModelSwitcher', 'selectedModel', 'thinkingEnabled']);
    this.enabled = settings.enableModelSwitcher !== false;
    if (settings.selectedModel) this.currentModelId = settings.selectedModel;
    if (settings.thinkingEnabled !== undefined) this.isThinkingEnabled = settings.thinkingEnabled;
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

    const targetAnchor = this.findMountAnchor();
    if (!targetAnchor) return;

    this.mountUI(targetAnchor);
  }

  /**
   * 邪魔にならない入力枠の周辺アンカーを探索
   */
  findMountAnchor() {
    const selectors = [
      '.input-area-container',
      '.chat-input-container',
      'rich-textarea',
      '[class*="input-box"]',
      'form[class*="query"]',
      '[class*="bottom-container"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el.parentElement || el;
    }
    return null;
  }

  mountUI(parent) {
    const bar = document.createElement('div');
    bar.id = this.containerId;
    bar.className = 'g-ext-model-bar-compact';

    // モデルボタングループ
    const modelGroup = document.createElement('div');
    modelGroup.className = 'g-ext-model-group';

    this.models.forEach((m) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `g-ext-model-btn ${m.id === this.currentModelId ? 'active' : ''}`;
      btn.dataset.modelId = m.id;
      btn.textContent = m.name;
      btn.title = `${m.fullName} に切り替え`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectModel(m);
      });

      modelGroup.appendChild(btn);
    });

    // セパレータ
    const divider = document.createElement('div');
    divider.className = 'g-ext-model-divider';

    // 強化版思考モード トグルボタン
    const thinkingBtn = document.createElement('button');
    thinkingBtn.type = 'button';
    thinkingBtn.id = 'g-ext-btn-thinking-toggle';
    thinkingBtn.className = `g-ext-thinking-btn ${this.isThinkingEnabled ? 'active' : ''}`;
    thinkingBtn.innerHTML = `<span>🧠</span><span>思考モード</span>`;
    thinkingBtn.title = '強化版思考モード（複雑な問題の解決）のON/OFF切り替え';

    thinkingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleThinkingMode();
    });

    bar.appendChild(modelGroup);
    bar.appendChild(divider);
    bar.appendChild(thinkingBtn);

    parent.insertBefore(bar, parent.firstChild);
    this.syncActiveState();
    console.log('[Gemini Extended Suite] Compact Model Switcher mounted');
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  syncActiveState() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // 公式UIのモデルドロップダウンボタンのテキストを検出
    const officialTrigger = this.findOfficialDropdownTrigger();
    if (officialTrigger) {
      const text = (officialTrigger.textContent || '').toLowerCase();
      
      const matched = this.models.find(m => m.keywords.some(k => text.includes(k)));
      if (matched && matched.id !== this.currentModelId) {
        this.currentModelId = matched.id;
      }

      // 思考モード（テキストに「思考」や「thinking」が含まれるか判定）
      if (text.includes('思考') || text.includes('thinking')) {
        this.isThinkingEnabled = true;
      }
    }

    // ボタンのハイライト更新
    container.querySelectorAll('.g-ext-model-btn').forEach(btn => {
      if (btn.dataset.modelId === this.currentModelId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const thinkingBtn = container.querySelector('#g-ext-btn-thinking-toggle');
    if (thinkingBtn) {
      if (this.isThinkingEnabled) {
        thinkingBtn.classList.add('active');
      } else {
        thinkingBtn.classList.remove('active');
      }
    }
  }

  findOfficialDropdownTrigger() {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    return buttons.find(b => {
      const txt = (b.textContent || '').trim();
      const aria = (b.getAttribute('aria-label') || '').trim();
      return (txt.includes('Flash') || txt.includes('Pro') || txt.includes('Lite') || aria.includes('モデル') || aria.includes('Model'))
             && (b.getAttribute('aria-haspopup') === 'menu' || b.querySelector('svg, mat-icon') || b.textContent.includes('˅') || b.textContent.includes('expand_more'));
    });
  }

  async selectModel(model) {
    this.currentModelId = model.id;
    chrome.storage.local.set({ selectedModel: model.id });
    this.syncActiveState();

    console.log(`[Gemini Extended Suite] Switching model to: ${model.fullName}`);
    await this.triggerOfficialSelection(model.keywords);
  }

  async toggleThinkingMode() {
    this.isThinkingEnabled = !this.isThinkingEnabled;
    chrome.storage.local.set({ thinkingEnabled: this.isThinkingEnabled });
    this.syncActiveState();

    console.log(`[Gemini Extended Suite] Toggling thinking mode: ${this.isThinkingEnabled ? 'ON' : 'OFF'}`);
    await this.triggerOfficialSelection(['思考', '強化版思考', 'thinking']);
  }

  async triggerOfficialSelection(keywords) {
    const trigger = this.findOfficialDropdownTrigger();
    if (!trigger) {
      console.warn('[Gemini Extended Suite] Official dropdown trigger not found');
      return;
    }

    try {
      // 1. ドロップダウンを開く
      trigger.click();
      await new Promise(r => setTimeout(r, 150));

      // 2. メニュー項目を探索
      const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], mat-option, div[class*="menu-item"]'));
      const targetItem = menuItems.find(item => {
        const text = (item.textContent || '').toLowerCase();
        return keywords.some(k => text.includes(k.toLowerCase()));
      });

      if (targetItem) {
        targetItem.click();
        console.log('[Gemini Extended Suite] Successfully selected official menu item');
      } else {
        // メニューを閉じる
        document.body.click();
      }
    } catch (err) {
      console.error('[Gemini Extended Suite] Model switch simulation error:', err);
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
