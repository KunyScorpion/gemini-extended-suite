/**
 * Gemini Extended Suite - Feature 6: エディタ・ナビゲーション快適化機能 (Chat Enhancer)
 * 目次・ミニマップ(Jump to Turn)、ワイド表示トグル、入力文字数カウンター、生成完了デスクトップ通知
 */

class ChatEnhancerModule {
  constructor() {
    this.tocContainerId = 'g-ext-toc-root';
    this.charCounterId = 'g-ext-char-counter-root';
    this.fullWidthBtnId = 'g-ext-full-width-toggle-btn';

    this.enabled = true;
    this.fullWidth = false;
    this.enableCharCount = true;
    this.enableToc = true;
    this.enableNotification = true;

    this.isGenerating = false;
    this.generationCheckInterval = null;
  }

  async init() {
    const data = await chrome.storage.local.get([
      'enableChatEnhancer',
      'fullWidthMode',
      'enableCharCount',
      'enableTableOfContents',
      'enableDesktopNotifications'
    ]);

    this.enabled = data.enableChatEnhancer !== false;
    this.fullWidth = !!data.fullWidthMode;
    this.enableCharCount = data.enableCharCount !== false;
    this.enableToc = data.enableTableOfContents !== false;
    this.enableNotification = data.enableDesktopNotifications !== false;

    // ワイドモード初期適用
    this.applyFullWidth(this.fullWidth);

    // 回答生成状態の監視（通知用）
    this.startGenerationWatcher();
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    this.mountCharCounter();
    this.mountTableOfContents();
    this.mountFullWidthToggle();
  }

  /* ---------------------------------------------------------
     1. ワイド表示トグル (Full-Width Mode)
     --------------------------------------------------------- */
  applyFullWidth(enabled) {
    if (enabled) {
      document.body.classList.add('g-ext-full-width-enabled');
    } else {
      document.body.classList.remove('g-ext-full-width-enabled');
    }
  }

  mountFullWidthToggle() {
    if (document.getElementById(this.fullWidthBtnId)) return;

    const header = document.querySelector('header [class*="actions"], header, .top-bar-container');
    if (!header) return;

    const btn = document.createElement('button');
    btn.id = this.fullWidthBtnId;
    btn.type = 'button';
    btn.className = 'g-ext-export-btn';
    btn.style.marginLeft = '4px';
    btn.innerHTML = `<span>⤢</span><span>ワイド</span>`;
    btn.title = '全幅ワイド表示の切り替え (85%〜100%)';

    btn.addEventListener('click', async () => {
      this.fullWidth = !this.fullWidth;
      this.applyFullWidth(this.fullWidth);
      await chrome.storage.local.set({ fullWidthMode: this.fullWidth });
      btn.style.borderColor = this.fullWidth ? 'var(--g-ext-primary)' : 'var(--g-ext-border)';
    });

    header.appendChild(btn);
  }

  /* ---------------------------------------------------------
     2. 入力文字数カウンター
     --------------------------------------------------------- */
  mountCharCounter() {
    if (!this.enableCharCount) return;
    if (document.getElementById(this.charCounterId)) return;

    const inputWrap = document.querySelector('.chat-input-container, rich-textarea, form[class*="query"]');
    if (!inputWrap) return;

    const counter = document.createElement('div');
    counter.id = this.charCounterId;
    counter.className = 'g-ext-char-counter';
    counter.innerHTML = `文字: 0 | 行: 1`;

    const targetParent = inputWrap.parentElement || inputWrap;
    targetParent.appendChild(counter);

    // 入力監視
    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target || (!target.isContentEditable && target.tagName !== 'TEXTAREA')) return;

      const text = target.isContentEditable ? target.innerText : target.value;
      const charCount = text ? text.replace(/\n$/, '').length : 0;
      const lineCount = text && charCount > 0 ? text.split('\n').length : 1;

      counter.innerHTML = `文字: ${charCount} | 行: ${lineCount}`;
    });
  }

  /* ---------------------------------------------------------
     3. チャット内目次（Jump to Turn）
     --------------------------------------------------------- */
  mountTableOfContents() {
    if (!this.enableToc) return;

    let toc = document.getElementById(this.tocContainerId);
    if (!toc) {
      toc = document.createElement('div');
      toc.id = this.tocContainerId;
      toc.className = 'g-ext-toc-container collapsed';

      toc.innerHTML = `
        <div class="g-ext-toc-header" id="g-ext-toc-toggle-header">
          <span>📑 目次</span>
          <span>≡</span>
        </div>
        <div class="g-ext-toc-list" id="g-ext-toc-list-body"></div>
      `;

      toc.querySelector('#g-ext-toc-toggle-header').addEventListener('click', () => {
        toc.classList.toggle('collapsed');
      });

      document.body.appendChild(toc);
    }

    this.updateTocItems();
  }

  updateTocItems() {
    const listBody = document.getElementById('g-ext-toc-list-body');
    if (!listBody) return;

    listBody.innerHTML = '';

    // ユーザーの発言要素を探索
    const userQueries = document.querySelectorAll(
      '[class*="user-query"], .user-query, [data-role="user"], message-content:has([class*="user"])'
    );

    if (userQueries.length === 0) {
      listBody.innerHTML = `<span style="font-size:11px;color:var(--g-ext-text-muted);padding:4px;">ターンがありません</span>`;
      return;
    }

    userQueries.forEach((qEl, idx) => {
      const text = (qEl.innerText || '').trim();
      const preview = text.length > 25 ? text.slice(0, 25) + '…' : text;

      const item = document.createElement('div');
      item.className = 'g-ext-toc-item';
      item.textContent = `${idx + 1}. ${preview || 'メッセージ'}`;
      item.title = text;

      item.addEventListener('click', () => {
        qEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      listBody.appendChild(item);
    });
  }

  /* ---------------------------------------------------------
     4. 生成完了デスクトップ通知
     --------------------------------------------------------- */
  startGenerationWatcher() {
    if (this.generationCheckInterval) clearInterval(this.generationCheckInterval);

    this.generationCheckInterval = setInterval(() => {
      if (!this.enableNotification) return;

      // 生成中インジケータ（停止ボタンやプログレスバーの存在）
      const stopBtn = document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"], .stop-button, mat-progress-bar');
      const nowGenerating = !!stopBtn;

      if (this.isGenerating && !nowGenerating) {
        // 生成完了を検知！
        if (document.hidden) {
          this.triggerCompletionNotification();
        }
      }

      this.isGenerating = nowGenerating;
    }, 800);
  }

  triggerCompletionNotification() {
    chrome.runtime.sendMessage({
      type: 'SHOW_NOTIFICATION',
      payload: {
        title: 'Gemini 回答完了',
        body: 'バックグラウンドで待機中のプロンプトの回答生成が完了しました。'
      }
    });
  }

  removeUI() {
    const toc = document.getElementById(this.tocContainerId);
    if (toc) toc.remove();

    const counter = document.getElementById(this.charCounterId);
    if (counter) counter.remove();

    const fullBtn = document.getElementById(this.fullWidthBtnId);
    if (fullBtn) fullBtn.remove();
  }
}

// 登録
window.chatEnhancerModule = new ChatEnhancerModule();
window.chatEnhancerModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('chatEnhancer', window.chatEnhancerModule);
  }
});
