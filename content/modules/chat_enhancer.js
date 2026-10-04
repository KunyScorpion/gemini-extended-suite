/**
 * Gemini Extended Suite - Feature 6: Chat Enhancer
 * 目次ミニマップ（高速点滅フリッカー解消・確実なジャンプ）、ワイド表示、文字数カウント、通知
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
    this.lastTocSignature = ''; // フリッカー防止用のDOMシグネチャ
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

    this.applyFullWidth(this.fullWidth);
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

  applyFullWidth(enabled) {
    if (enabled) {
      document.body.classList.add('g-ext-full-width-enabled');
    } else {
      document.body.classList.remove('g-ext-full-width-enabled');
    }
  }

  mountFullWidthToggle() {
    if (document.getElementById(this.fullWidthBtnId)) return;

    // 右上フローティングバーまたはヘッダーに配置
    let utilBar = document.getElementById('g-ext-top-floating-bar');
    if (!utilBar) {
      utilBar = document.createElement('div');
      utilBar.id = 'g-ext-top-floating-bar';
      utilBar.className = 'g-ext-top-floating-bar';
      document.body.appendChild(utilBar);
    }

    const btn = document.createElement('button');
    btn.id = this.fullWidthBtnId;
    btn.type = 'button';
    btn.className = 'g-ext-export-btn';
    btn.innerHTML = `<span>⤢</span><span>ワイド</span>`;
    btn.title = '全幅ワイド表示の切り替え (85%〜100%)';

    btn.addEventListener('click', async () => {
      this.fullWidth = !this.fullWidth;
      this.applyFullWidth(this.fullWidth);
      await chrome.storage.local.set({ fullWidthMode: this.fullWidth });
      btn.style.borderColor = this.fullWidth ? 'var(--g-ext-primary)' : 'var(--g-ext-border)';
    });

    utilBar.appendChild(btn);
  }

  mountCharCounter() {
    if (!this.enableCharCount) return;
    if (document.getElementById(this.charCounterId)) return;

    const inputWrap = document.querySelector('.chat-input-container, rich-textarea, form[class*="query"]');
    if (!inputWrap) return;

    const counter = document.createElement('div');
    counter.id = this.charCounterId;
    counter.className = 'g-ext-char-counter';
    counter.innerHTML = `0 字 | 1 行`;

    const targetParent = inputWrap.parentElement || inputWrap;
    targetParent.appendChild(counter);

    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target || (!target.isContentEditable && target.tagName !== 'TEXTAREA')) return;

      const text = target.isContentEditable ? target.innerText : target.value;
      const charCount = text ? text.replace(/\n$/, '').length : 0;
      const lineCount = text && charCount > 0 ? text.split('\n').length : 1;

      counter.innerHTML = `${charCount} 字 | ${lineCount} 行`;
    });
  }

  /* ---------------------------------------------------------
     目次ミニマップ（高速点滅フリッカー解消 ＆ スムーズジャンプ）
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
          <span style="font-size:10px;">▼</span>
        </div>
        <div class="g-ext-toc-list" id="g-ext-toc-list-body"></div>
      `;

      toc.querySelector('#g-ext-toc-toggle-header').addEventListener('click', (e) => {
        e.stopPropagation();
        toc.classList.toggle('collapsed');
      });

      document.body.appendChild(toc);
    }

    this.updateTocItems();
  }

  updateTocItems() {
    const listBody = document.getElementById('g-ext-toc-list-body');
    if (!listBody) return;

    // ユーザー質問要素の収集
    const userQueryElements = Array.from(document.querySelectorAll(
      '[class*="user-query"], .user-query, [data-role="user"], message-content:has([class*="user"]), [class*="user-turn"]'
    )).filter(el => (el.textContent || '').trim().length > 0);

    // シグネチャを作成し、変更がない場合はDOMを再描画しない（フリッカーを完全防止！）
    const signature = userQueryElements.map(el => (el.textContent || '').trim().slice(0, 30)).join('||');
    if (signature === this.lastTocSignature && listBody.children.length > 0) {
      return; // 変更なしのためスキップ
    }
    this.lastTocSignature = signature;

    listBody.innerHTML = '';

    if (userQueryElements.length === 0) {
      listBody.innerHTML = `<span style="font-size:11px;color:var(--g-ext-text-muted);padding:4px;">発言がありません</span>`;
      return;
    }

    userQueryElements.forEach((qEl, idx) => {
      const text = (qEl.innerText || qEl.textContent || '').trim();
      const preview = text.length > 22 ? text.slice(0, 22) + '…' : text;

      const item = document.createElement('div');
      item.className = 'g-ext-toc-item';
      item.innerHTML = `<span style="color:var(--g-ext-primary);font-weight:700;margin-right:4px;">#${idx + 1}</span><span>${preview || '質問'}</span>`;
      item.title = text;

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 対象要素へスムーズスクロール
        qEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 一瞬ハイライト
        qEl.style.transition = 'outline 0.2s ease';
        qEl.style.outline = '2px solid var(--g-ext-primary)';
        setTimeout(() => {
          qEl.style.outline = 'none';
        }, 1200);
      });

      listBody.appendChild(item);
    });
  }

  startGenerationWatcher() {
    if (this.generationCheckInterval) clearInterval(this.generationCheckInterval);

    this.generationCheckInterval = setInterval(() => {
      if (!this.enableNotification || !document.hidden) {
        this.isGenerating = false;
        return;
      }

      const stopBtn = document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]');
      const nowGenerating = !!stopBtn;

      if (this.isGenerating && !nowGenerating) {
        chrome.runtime.sendMessage({
          type: 'SHOW_NOTIFICATION',
          payload: {
            title: 'Gemini 回答完了',
            body: 'バックグラウンドで待機中の回答生成が完了しました。'
          }
        });
      }

      this.isGenerating = nowGenerating;
    }, 1500);
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
