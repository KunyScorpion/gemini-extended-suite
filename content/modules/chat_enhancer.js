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
    this.mountResponseCharCounters();
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

      counter.innerHTML = `${charCount.toLocaleString()} 字 | ${lineCount.toLocaleString()} 行`;
    });
  }

  /* ---------------------------------------------------------
     Gemini返答メッセージ文字数カウント（アクションバー直下に一段分けてひっそり表示）
     --------------------------------------------------------- */
  mountResponseCharCounters() {
    if (!this.enableCharCount) {
      this.removeResponseCharCounters();
      return;
    }

    // 1. 各返答コンテナ（model-response 等）を収集
    let turns = Array.from(document.querySelectorAll('model-response'));

    // フォールバック: model-response が無い場合は conversation-turn からユーザー発言以外を抽出
    if (turns.length === 0) {
      turns = Array.from(document.querySelectorAll('.conversation-turn, [class*="conversation-turn"]'))
        .filter(el => !el.querySelector('.user-query, [data-role="user"], user-query'));
    }

    // さらにフォールバック: コピーボタンの祖先要素から回答ターンを重複なく収集
    if (turns.length === 0) {
      const copyBtns = Array.from(document.querySelectorAll('button[aria-label*="コピー"], button[aria-label*="Copy"]'))
        .filter(btn => !btn.closest('.user-query, [data-role="user"]'));
      const seen = new Set();
      copyBtns.forEach(btn => {
        const turn = btn.closest('model-response, [class*="response-container"], [class*="conversation-turn"]')
          || btn.closest('message-actions')?.parentElement;
        if (turn && !seen.has(turn)) {
          seen.add(turn);
          turns.push(turn);
        }
      });
    }

    // 2. 各返答ごとに1対1で文字数を計算し、アクションバー直下に配置
    turns.forEach(turn => {
      this.updateSingleTurnCounter(turn);
    });
  }

  updateSingleTurnCounter(turn) {
    if (!turn) return;

    // A. その返答【専用】の本文要素を取得
    const contentEl = turn.querySelector(
      'message-content, .message-content, markdown-renderer, .markdown-renderer, .model-response-text'
    ) || turn;

    // B. 思考プロセスの分離
    let thinkingChars = 0;
    const thinkingEl = turn.querySelector('[class*="thinking"], [class*="reasoning"], details');
    if (thinkingEl) {
      thinkingChars = (thinkingEl.innerText || '').trim().length;
    }

    // C. 本文テキスト抽出（思考ブロック、ボタン、既存カウンター等のノイズを除去）
    const clone = contentEl.cloneNode(true);
    clone.querySelectorAll(
      '[class*="thinking"], [class*="reasoning"], details, .g-ext-response-char-counter-row, .g-ext-response-char-counter, message-actions, [role="toolbar"], button'
    ).forEach(el => el.remove());

    const rawText = (clone.innerText || '').trim();
    if (!rawText) return;

    const charCount = rawText.length;
    const lineCount = rawText.split('\n').length;

    // D. 挿入先: アクションバー（message-actions やボタンコンテナ）の直後（一段下）
    const actionsEl = turn.querySelector('message-actions, [role="toolbar"], [class*="actions"]')
      || turn.querySelector('button[aria-label*="コピー"], button[aria-label*="Copy"]')?.closest('[class*="actions"], div');

    if (!actionsEl) return;

    // E. カウンター行（row）の取得または作成
    let counterRow = turn.querySelector('.g-ext-response-char-counter-row');
    if (!counterRow) {
      counterRow = document.createElement('div');
      counterRow.className = 'g-ext-response-char-counter-row';
      counterRow.innerHTML = `<span class="g-ext-response-char-counter"></span>`;
    }

    // アクションバーの直後（一段下）に配置
    if (counterRow.previousElementSibling !== actionsEl) {
      actionsEl.insertAdjacentElement('afterend', counterRow);
    }

    const counterSpan = counterRow.querySelector('.g-ext-response-char-counter');
    const formattedChars = charCount.toLocaleString();
    const formattedLines = lineCount.toLocaleString();
    counterSpan.textContent = `${formattedChars} 字`;

    let tooltip = `文字数: ${formattedChars} 字 (空白含む)\n行数: ${formattedLines} 行`;
    if (thinkingChars > 0) {
      tooltip += `\n(本文: ${formattedChars} 字 / 思考プロセス: ${thinkingChars.toLocaleString()} 字)`;
    }
    counterSpan.title = tooltip;
  }

  removeResponseCharCounters() {
    document.querySelectorAll('.g-ext-response-char-counter-row, .g-ext-response-char-counter').forEach(el => el.remove());
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

    // 1. ユーザー発言要素の候補を収集
    const rawElements = Array.from(document.querySelectorAll(
      '.user-query, [class*="user-query"], user-query, [data-role="user"], [class*="user-turn"]'
    )).filter(el => {
      const txt = (el.textContent || '').trim();
      return txt.length > 0 && !el.closest('.g-ext-toc-container');
    });

    // 2. 包含関係の排除（他の候補要素の中に含まれている子要素は除外）
    const topLevelUserElements = rawElements.filter(el => {
      return !rawElements.some(other => other !== el && other.contains(el));
    });

    // 3. テキストの重複排除と整形
    const uniqueTurns = [];
    const seenTexts = new Set();

    topLevelUserElements.forEach(el => {
      let rawText = (el.innerText || el.textContent || '').trim();

      // 「あなたのプロンプト」や「ユーザー」などのアクセシビリティ用ノイズプレフィックスを除去
      let cleaned = rawText
        .replace(/^(あなたのプロンプト|ユーザーのプロンプト|ユーザー|User said|You said)[\s:：>＞]*/i, '')
        .trim();

      if (!cleaned) cleaned = rawText; // 万が一空になった場合は元テキスト

      // 先頭30文字で重複チェック（同一発言の重複登録を防止）
      const key = cleaned.slice(0, 30);
      if (!seenTexts.has(key)) {
        seenTexts.add(key);
        uniqueTurns.push({ element: el, text: cleaned });
      }
    });

    // 4. シグネチャ照合（フリッカー防止）
    const signature = uniqueTurns.map(t => t.text.slice(0, 20)).join('||');
    if (signature === this.lastTocSignature && listBody.children.length > 0) {
      return;
    }
    this.lastTocSignature = signature;

    listBody.innerHTML = '';

    if (uniqueTurns.length === 0) {
      listBody.innerHTML = `<span style="font-size:11px;color:var(--g-ext-text-muted);padding:4px;">発言がありません</span>`;
      return;
    }

    uniqueTurns.forEach((turn, idx) => {
      const preview = turn.text.length > 20 ? turn.text.slice(0, 20) + '…' : turn.text;

      const item = document.createElement('div');
      item.className = 'g-ext-toc-item';
      item.innerHTML = `<span style="color:var(--g-ext-primary);font-weight:700;margin-right:4px;">#${idx + 1}</span><span>${preview}</span>`;
      item.title = turn.text;

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        turn.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        turn.element.style.transition = 'outline 0.2s ease';
        turn.element.style.outline = '2px solid var(--g-ext-primary)';
        setTimeout(() => {
          turn.element.style.outline = 'none';
        }, 1200);
      });

      listBody.appendChild(item);
    });
  }

  startGenerationWatcher() {
    if (this.generationCheckInterval) clearInterval(this.generationCheckInterval);

    this.generationCheckInterval = setInterval(() => {
      const stopBtn = document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]');
      const nowGenerating = !!stopBtn;

      // 生成中の場合はリアルタイムに回答文字数カウンターを追従更新
      if (nowGenerating && this.enableCharCount) {
        this.mountResponseCharCounters();
      }

      // 生成完了の瞬間（停止ボタンが消えた時）
      if (this.isGenerating && !nowGenerating) {
        if (this.enableCharCount) {
          this.mountResponseCharCounters();
        }

        if (this.enableNotification && document.hidden) {
          chrome.runtime.sendMessage({
            type: 'SHOW_NOTIFICATION',
            payload: {
              title: 'Gemini 回答完了',
              body: 'バックグラウンドで待機中の回答生成が完了しました。'
            }
          });
        }
      }

      this.isGenerating = nowGenerating;
    }, 400);
  }

  removeUI() {
    const toc = document.getElementById(this.tocContainerId);
    if (toc) toc.remove();

    const counter = document.getElementById(this.charCounterId);
    if (counter) counter.remove();

    this.removeResponseCharCounters();

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
