/**
 * Gemini Extended Suite - Feature 7: 思考レベル (Thinking Level) クイック切替
 * 2026/10・2026/11仕様変更に伴う3段階の思考レベル（低/標準(中)/高）をボタン一発で瞬時に切替
 * 入力エリア限定の安全なアンカー特定・自己位置修復・手動変更への即時追従対応版
 */

class ThinkingSelectorModule {
  constructor() {
    this.containerId = 'g-ext-thinking-level-root';
    this.enabled = true;
    this.isSwitching = false;
    this.currentLevel = null; // 'low' | 'medium' | 'high'
    this.observedBtn = null;
    this.modelBtnObserver = null;
    this.mountWatcherInterval = null;
    this.watcherIntervalMs = 300;
    this.invalidContainerSelector = [
      'bard-sidenav',
      'side-nav',
      'mat-sidenav',
      '[data-test-id="overflow-container"]',
      'model-response',
      'user-query',
      'message-content',
      'message-actions',
      '.conversation-turn',
      '.cdk-overlay-container',
      '.cdk-overlay-pane'
    ].join(', ');

    // インスタンス生成直後から即時監視を開始（初期ロード遅延・アドオン設定触り不要化）
    this.startMountWatcher(300);
  }

  async init() {
    const data = await chrome.storage.local.get(['enableThinkingSelector']);
    this.enabled = data.enableThinkingSelector !== false;

    // 画面クリック時にも即時同期
    document.addEventListener('click', () => {
      setTimeout(() => this.syncActiveLevel(), 80);
      setTimeout(() => this.syncActiveLevel(), 250);
    }, { passive: true });

    // ページロード時やSPA遷移時の即時チェック
    window.addEventListener('load', () => this.checkAndMount());
    window.addEventListener('g-ext-url-changed', () => {
      setTimeout(() => this.checkAndMount(), 150);
      setTimeout(() => this.checkAndMount(), 500);
    });

    this.checkAndMount();
  }

  /**
   * 要素が画面上に可視状態であるかを判定
   */
  isVisibleElement(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  /**
   * サイドバー・会話本文・オーバーレイ・拡張機能自身などの無効コンテキスト内かどうかを判定
   */
  isInvalidButtonContext(el) {
    if (!el) return true;
    if (el.id === this.containerId) return true;
    const extAncestor = el.closest('[id^="g-ext-"], [class*="g-ext-"]:not(body):not(html)');
    if (extAncestor && extAncestor !== document.body && extAncestor !== document.documentElement) {
      return true;
    }
    return !!el.closest(this.invalidContainerSelector);
  }

  /**
   * マウント済みルート要素が不正な領域（サイドバー等）に配置されていないか判定
   */
  isInInvalidContainer(el) {
    if (!el || !el.parentElement) return true;
    return !!el.parentElement.closest(this.invalidContainerSelector);
  }

  /**
   * 常駐マウントウォッチャー（初回マウント完了後は2000ms間隔に緩和してCPU負荷を軽減）
   */
  startMountWatcher(intervalMs = 300) {
    if (this.mountWatcherInterval) clearInterval(this.mountWatcherInterval);
    this.watcherIntervalMs = intervalMs;

    this.mountWatcherInterval = setInterval(() => {
      if (!this.enabled) return;

      const existing = document.getElementById(this.containerId);
      const anchorInfo = this.findMountAnchor();

      if (!existing && anchorInfo) {
        // 未マウントでアンカーが見つかったら即マウント
        this.mountUI(anchorInfo.parent, anchorInfo.beforeElement);
        window.skillLauncherModule?.checkAndMount();
        if (this.watcherIntervalMs !== 2000) {
          this.startMountWatcher(2000);
        }
      } else if (existing && anchorInfo) {
        // 既に存在するが位置がズレている場合や不正領域にいる場合は正しい位置へ自己修復
        if (
          this.isInInvalidContainer(existing) ||
          existing.parentElement !== anchorInfo.parent ||
          existing.nextElementSibling !== anchorInfo.beforeElement
        ) {
          console.log('[Gemini Extended Suite] 思考レベルボタンをモデル選択の左隣へ自己修復配置します');
          anchorInfo.parent.insertBefore(existing, anchorInfo.beforeElement);
        }
        window.skillLauncherModule?.checkAndMount();
        this.syncActiveLevel();
        // 初回マウント完了・正常配置確認後はポーリング間隔を2000msへ緩和
        if (this.watcherIntervalMs !== 2000) {
          this.startMountWatcher(2000);
        }
      } else if (existing) {
        if (this.isInInvalidContainer(existing)) {
          existing.remove();
          return;
        }
        this.syncActiveLevel();
      }
    }, intervalMs);
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const anchorInfo = this.findMountAnchor();
    const existing = document.getElementById(this.containerId);

    if (!anchorInfo) {
      if (existing && this.isInInvalidContainer(existing)) {
        existing.remove();
      }
      return;
    }

    if (existing) {
      if (
        this.isInInvalidContainer(existing) ||
        existing.parentElement !== anchorInfo.parent ||
        existing.nextElementSibling !== anchorInfo.beforeElement
      ) {
        console.log('[Gemini Extended Suite] 思考レベルボタンをモデル選択の左隣へ再配置します');
        anchorInfo.parent.insertBefore(existing, anchorInfo.beforeElement);
      }
      window.skillLauncherModule?.checkAndMount();
      this.syncActiveLevel();
      return;
    }

    this.mountUI(anchorInfo.parent, anchorInfo.beforeElement);
    window.skillLauncherModule?.checkAndMount();
  }

  /**
   * マウント先アンカーの特定
   * ★モデルピッカーの「上」ではなく、下部ツールバー内の「モデルピッカーコンテナのすぐ左隣」を確実に特定
   */
  findMountAnchor() {
    const modelBtn = this.findModelPickerButton();
    if (!modelBtn) return null;

    this.attachButtonObserver(modelBtn);

    // 1. モデルボタンの周辺から、マイクや送信ボタンが並ぶ「下部ツールバー行コンテナ」を探索（外枠誤爆防止のため [class*="bottom"] は除外）
    let toolbar = modelBtn.closest('[class*="actions"], [class*="toolbar"], [class*="trailing"], [class*="buttons"]');
    if (toolbar && toolbar.closest(this.invalidContainerSelector)) {
      toolbar = null;
    }

    // 2. 見つからない場合のみ、親を辿ってマイクや送信ボタンを含む行を探す
    if (!toolbar) {
      let curr = modelBtn.parentElement;
      while (curr && curr !== document.body && !curr.matches('.chat-input-container, form, rich-textarea, main')) {
        if (curr.closest(this.invalidContainerSelector)) break;
        const hasOtherAction = curr.querySelector(
          'button[aria-label*="マイク"], button[aria-label*="音声"], button[aria-label*="送信"], button[aria-label*="Mic"], button[aria-label*="Send"], [class*="send"], [class*="mic"]'
        );
        if (hasOtherAction && hasOtherAction !== modelBtn) {
          toolbar = curr;
          break;
        }
        curr = curr.parentElement;
      }
    }

    // 3. ツールバー行の中で、モデルボタンを内包しているトップレベルの子要素（ラッパーまたはボタン自身）を特定
    if (toolbar) {
      let anchorChild = modelBtn;
      while (anchorChild && anchorChild.parentElement !== toolbar) {
        anchorChild = anchorChild.parentElement;
      }

      if (anchorChild && anchorChild.parentElement === toolbar) {
        return {
          parent: toolbar,
          beforeElement: anchorChild // モデルピッカー枠全体の「直前（左隣・同一行）」
        };
      }
    }

    // 4. フォールバック: 親要素の親（横並び行）
    if (modelBtn.parentElement && modelBtn.parentElement.parentElement && !modelBtn.parentElement.parentElement.closest(this.invalidContainerSelector)) {
      return {
        parent: modelBtn.parentElement.parentElement,
        beforeElement: modelBtn.parentElement
      };
    }

    return {
      parent: modelBtn.parentElement,
      beforeElement: modelBtn
    };
  }

  /**
   * 可視の <button> 要素のみからモデルピッカーボタンを探索
   */
  findModelPickerButton() {
    const allButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
      if (this.isInvalidButtonContext(btn)) return false;
      const rect = btn.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const keywords = [
      'Hydrogen', 'Carbon', 'Argon', 'Flash', 'Pro', 'Ultra', 'Nano', 'Gemini',
      '迅速な回答', '日々の暮らし', '詳細なリサーチ', 'コードと分析', '複雑な作業'
    ];

    // 1. 実績あるキーワード探索（可視 <button> のみ）
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim();
      if (!text || text.length >= 35) continue;

      const hasModelKeyword = keywords.some(kw => text.includes(kw));
      const hasThinkingKeyword = text.includes('高値') || text.includes('安値') || text.includes('標準');
      const hasDropdown = !!btn.querySelector('svg, mat-icon, [class*="arrow"], [class*="expand"]') ||
                          btn.getAttribute('aria-haspopup') === 'menu' ||
                          btn.getAttribute('aria-expanded') !== null;

      if ((hasModelKeyword || hasThinkingKeyword) && (hasDropdown || text.length < 35)) {
        return btn;
      }
    }

    // 2. 属性フォールバック（必ず可視 <button> のみ）
    for (const btn of allButtons) {
      if (
        btn.matches('button[aria-label*="モデル"], button[aria-label*="Model"], button[data-test-id*="model"], button[class*="model-picker"], button[class*="model-select"]') ||
        btn.closest('[class*="model-picker-btn"], [class*="model-select"], bard-mode-switcher')
      ) {
        return btn;
      }
    }

    return null;
  }

  /**
   * モデル選択ボタン自身のDOM変更（テキスト変更）をリアルタイムに監視
   */
  attachButtonObserver(modelBtn) {
    if (this.observedBtn === modelBtn) return;
    if (this.modelBtnObserver) {
      this.modelBtnObserver.disconnect();
    }
    this.observedBtn = modelBtn;
    if (!modelBtn) return;

    this.modelBtnObserver = new MutationObserver(() => {
      this.syncActiveLevel();
    });

    this.modelBtnObserver.observe(modelBtn, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  mountUI(parent, beforeElement) {
    const root = document.createElement('div');
    root.id = this.containerId;
    root.className = 'g-ext-thinking-level-root';

    root.innerHTML = `
      <span class="g-ext-thinking-label" title="思考レベル（Thinking Level）クイック切替">🧠 思考:</span>
      <div class="g-ext-thinking-group">
        <button type="button" class="g-ext-thinking-btn" data-level="low" title="思考レベル: 低 - 高速かつ効率的">低</button>
        <button type="button" class="g-ext-thinking-btn" data-level="medium" title="思考レベル: 中 (標準) - バランスを取って詳しく">中</button>
        <button type="button" class="g-ext-thinking-btn" data-level="high" title="思考レベル: 高 - 徹底的に詳しく">高</button>
      </div>
    `;

    // クリックイベントの登録
    root.querySelectorAll('.g-ext-thinking-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const level = btn.getAttribute('data-level');
        this.selectThinkingLevel(level);
      });
    });

    if (beforeElement) {
      parent.insertBefore(root, beforeElement);
    } else {
      parent.appendChild(root);
    }

    this.syncActiveLevel();
    console.log('[Gemini Extended Suite] Thinking Level quick selector successfully mounted in toolbar');
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
    if (this.modelBtnObserver) {
      this.modelBtnObserver.disconnect();
      this.modelBtnObserver = null;
    }
    this.observedBtn = null;
  }

  /**
   * メニュー項目要素から思考レベルテキストを抽出し、低/中/高 を判定するヘルパー
   */
  _extractNormalizedMenuText(item) {
    const clone = item.cloneNode(true);
    clone.querySelectorAll('mat-icon, svg, .mat-icon').forEach(icon => icon.remove());
    const rawWithoutDomIcons = (clone.textContent || '').trim();
    const rawText = rawWithoutDomIcons || (item.textContent || '').trim();
    const textWithoutIcon = rawText
      .replace(/^(check_circle_outline|check_circle|radio_button_checked|radio_button_unchecked|check|done|✓|✔|●|•)\s*/i, '')
      .trim();
    const lines = textWithoutIcon.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const firstLine = lines[0] || textWithoutIcon;
    return { rawText, textWithoutIcon, firstLine, lower: textWithoutIcon.toLowerCase() };
  }

  /**
   * サブメニュー項目が対象レベルに一致するか厳密判定
   */
  _matchesSubItemLevel(item, targetLevel) {
    const { textWithoutIcon, firstLine } = this._extractNormalizedMenuText(item);
    if (!textWithoutIcon || textWithoutIcon.length > 60) return false;
    if (textWithoutIcon.includes('高速かつ効率的') && textWithoutIcon.includes('バランス')) return false;

    if (targetLevel === 'low') {
      return (
        /^(低|安値|最小|low|min|light)([\s\u3000]|$)/i.test(firstLine) ||
        /^(低|安値|最小|low|min|light)([\s\u3000\n]|$)/i.test(textWithoutIcon) ||
        textWithoutIcon.includes('高速かつ効率的') ||
        textWithoutIcon.includes('時間をかけず') ||
        textWithoutIcon.includes('安値')
      );
    }

    if (targetLevel === 'medium') {
      return (
        /^(標準|中|medium|standard|balanced)([\s\u3000]|$)/i.test(firstLine) ||
        /^(標準|中|medium|standard|balanced)([\s\u3000\n]|$)/i.test(textWithoutIcon) ||
        textWithoutIcon.includes('バランスを取って') ||
        textWithoutIcon.includes('標準')
      );
    }

    if (targetLevel === 'high') {
      const startsWithOtherLevel =
        /^(低|安値|最小|標準|中|low|medium|standard|balanced|min|light)([\s\u3000\n]|$)/i.test(firstLine) ||
        /^(低|安値|最小|標準|中|low|medium|standard|balanced|min|light)([\s\u3000\n]|$)/i.test(textWithoutIcon);
      if (startsWithOtherLevel) return false;

      const textWithoutFast = textWithoutIcon.replace(/高速/g, '');
      return (
        /^(高値|高(?!速)|最大|high|deep|max)([\s\u3000]|$)/i.test(firstLine) ||
        /^(高値|高(?!速)|最大|high|deep|max)([\s\u3000\n]|$)/i.test(textWithoutIcon) ||
        textWithoutFast.includes('徹底的') ||
        textWithoutFast.includes('高値') ||
        textWithoutFast.includes('高')
      );
    }

    return false;
  }

  /**
   * 現在選択されている思考レベルをサブメニューのチェックマークやボタン表示から検知し同期
   */
  syncActiveLevel() {
    const root = document.getElementById(this.containerId);
    if (!root) return;

    const modelBtn = this.findModelPickerButton();
    if (modelBtn && this.observedBtn !== modelBtn) {
      this.attachButtonObserver(modelBtn);
    }

    let detectedLevel = null;

    // 1. 開いている思考レベルサブメニューのチェック状態から検知
    const overlayItems = Array.from(document.querySelectorAll(
      '.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane [role="menuitemcheckbox"], .cdk-overlay-pane [role="menuitemradio"], .cdk-overlay-pane [role="option"], .cdk-overlay-pane button.mat-mdc-menu-item, .cdk-overlay-pane .mat-menu-item, .cdk-overlay-pane button'
    ));
    for (const item of overlayItems) {
      if (item.closest(`#${this.containerId}`)) continue;
      if (!this.isVisibleElement(item)) continue;
      if (this._isModelOrParentMenuItem(item)) continue;

      const hasCheckAttr =
        item.getAttribute('aria-checked') === 'true' ||
        item.getAttribute('aria-selected') === 'true' ||
        item.classList.contains('selected') ||
        item.classList.contains('active') ||
        item.classList.contains('checked');
      const hasCheckIcon = Array.from(item.querySelectorAll('mat-icon, svg, [class*="check"], [class*="selected"]')).some(iconEl => {
        if (!this.isVisibleElement(iconEl)) return false;
        const iconTxt = (iconEl.textContent || '').trim().toLowerCase();
        const fontIcon = (iconEl.getAttribute('fonticon') || iconEl.getAttribute('data-mat-icon-name') || '').toLowerCase();
        if (iconEl.tagName.toLowerCase() === 'svg') {
          return !iconEl.closest('[class*="arrow"], [class*="chevron"]');
        }
        return ['check', 'done', 'check_circle', '✓', '✔'].includes(iconTxt) || ['check', 'done', 'check_circle'].includes(fontIcon);
      });

      if (hasCheckAttr || hasCheckIcon) {
        if (this._matchesSubItemLevel(item, 'low')) {
          detectedLevel = 'low';
          break;
        } else if (this._matchesSubItemLevel(item, 'medium')) {
          detectedLevel = 'medium';
          break;
        } else if (this._matchesSubItemLevel(item, 'high')) {
          detectedLevel = 'high';
          break;
        }
      }
    }

    // 2. ボタン表示テキストから検知（モデル名のみの表示の場合は上書きしない）
    if (!detectedLevel) {
      const btnText = modelBtn ? (modelBtn.textContent || '').trim() : '';
      if (btnText.includes('高値') || /\bhigh\b/i.test(btnText) || /[\s\u3000]高(?!速)($|[\s\u3000])/i.test(btnText)) {
        detectedLevel = 'high';
      } else if (btnText.includes('標準') || btnText.includes('中') || /medium|balanced|standard/i.test(btnText)) {
        detectedLevel = 'medium';
      } else if (btnText.includes('安値') || btnText.includes('低') || /\b(low|fast)\b/i.test(btnText)) {
        detectedLevel = 'low';
      }
    }

    if (detectedLevel) {
      this.currentLevel = detectedLevel;
    }

    root.querySelectorAll('.g-ext-thinking-btn').forEach(btn => {
      const level = btn.getAttribute('data-level');
      if (level === this.currentLevel) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * メニュー項目がモデル選択肢や「思考レベル」親項目（サブメニュー項目ではないもの）かどうかを判定
   */
  _isModelOrParentMenuItem(item) {
    const rawText = (item?.textContent || '').trim();
    if (!rawText) return true;
    const lower = rawText.toLowerCase();

    if (rawText.includes('思考レベル') || rawText.includes('思考の深さ') || lower.includes('thinking level')) {
      return true;
    }

    const modelBlacklist = [
      'hydrogen', 'carbon', 'argon', 'flash', 'pro', 'ultra', 'nano',
      '迅速な回答', '日々の暮らし', '詳細なリサーチ', 'コードと分析', '複雑な作業',
      '4 hydrogen', '4 argon', '4 carbon', '3.5', '3.8', '3.1',
      '高度な推論', 'すばやく回答', 'あらゆる場面', '複雑なタスク'
    ];
    return modelBlacklist.some(kw => lower.includes(kw));
  }

  /**
   * 思考レベルを自動選択（公式メニューをバックグラウンドで操作）
   */
  async selectThinkingLevel(targetLevel) {
    if (this.isSwitching) return;

    this.isSwitching = true;
    this.updateButtonLoading(targetLevel, true);

    try {
      const success = await this._performSwitch(targetLevel);
      if (success) {
        this.currentLevel = targetLevel;
        this.syncActiveLevel();
        const levelNames = { low: '低', medium: '中 (標準)', high: '高' };
        this.showToast(`思考レベルを「${levelNames[targetLevel]}」に変更しました`);
      } else {
        console.warn('[Gemini Extended Suite] Failed to automatically switch thinking level');
        this.showToast('思考レベルの切り替えに失敗しました。プルダウンから選択してください。', true);
      }
    } catch (err) {
      console.error('[Gemini Extended Suite] Error during thinking level switch:', err);
    } finally {
      this.isSwitching = false;
      this.updateButtonLoading(targetLevel, false);
      this.syncActiveLevel();
    }
  }

  updateButtonLoading(targetLevel, isLoading) {
    const root = document.getElementById(this.containerId);
    if (!root) return;

    root.querySelectorAll('.g-ext-thinking-btn').forEach(btn => {
      if (btn.getAttribute('data-level') === targetLevel) {
        if (isLoading) {
          btn.classList.add('loading');
        } else {
          btn.classList.remove('loading');
        }
      }
    });
  }

  /**
   * 公式プルダウンメニューを自動操作して目的の思考レベルをクリック
   */
  async _performSwitch(targetLevel) {
    const modelBtn = this.findModelPickerButton();
    if (!modelBtn) {
      console.error('[Gemini Extended Suite] Model picker button not found');
      return false;
    }

    // 1. モデルピッカーボタンをクリックしてメニューを開く
    modelBtn.click();

    // 2. メニュー要素が表示されるのを待機
    const menu = await this._waitForElement(
      'mat-menu-panel, [role="menu"], .cdk-overlay-pane [class*="menu"], [class*="model-menu"]',
      1200
    );
    if (!menu) {
      console.warn('[Gemini Extended Suite] Menu container did not appear');
      return false;
    }

    // 3. 先に1段目メニューから「思考レベル」親項目を探索
    await this._sleep(60);
    const thinkingMenuItem = await this._waitForThinkingMenuItem(350);
    let targetSubItem = null;

    if (thinkingMenuItem) {
      // 4a. まずホバーでサブメニュー展開を試みる（ホバーで開くメニューをクリックして閉じてしまうのを防ぐ）
      this._triggerHover(thinkingMenuItem);
      targetSubItem = await this._waitForSubMenuItem(targetLevel, 400, thinkingMenuItem);

      // 4b. ホバーだけで開かない場合はクリックして展開を待つ
      if (!targetSubItem) {
        thinkingMenuItem.click();
        targetSubItem = await this._waitForSubMenuItem(targetLevel, 1000, thinkingMenuItem);
      }
    } else {
      // 「思考レベル」親項目が存在しないUIの場合のみ、1段目メニューから直接探索
      targetSubItem = await this._waitForSubMenuItem(targetLevel, 600, null);
    }

    if (!targetSubItem) {
      console.warn(`[Gemini Extended Suite] Target thinking item for level "${targetLevel}" not found`);
      await this._closeMenus();
      return false;
    }

    // 5. 目的の思考レベルをクリック
    targetSubItem.click();

    // 6. メニューが残っていれば確実に閉じる
    await this._sleep(80);
    await this._closeMenus();

    // 7. 変更後のステータスを即時同期
    setTimeout(() => this.syncActiveLevel(), 80);
    setTimeout(() => this.syncActiveLevel(), 250);

    return true;
  }

  _waitForThinkingMenuItem(timeoutMs = 350) {
    return new Promise(resolve => {
      const immediate = this._findThinkingMenuItem();
      if (immediate) return resolve(immediate);

      const startTime = Date.now();
      const interval = setInterval(() => {
        const item = this._findThinkingMenuItem();
        if (item) {
          clearInterval(interval);
          resolve(item);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 30);
    });
  }

  _findThinkingMenuItem() {
    const items = Array.from(document.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], button.mat-mdc-menu-item, .mat-menu-item, [class*="menu-item"], .cdk-overlay-pane button'
    ));

    const keywords = ['思考レベル', 'Thinking level', 'Thinking', '思考'];
    const modelExcludeWords = ['Hydrogen', 'Carbon', 'Argon', 'Flash', 'Pro', 'Ultra', 'Nano'];
    for (const item of items) {
      if (item.closest(`#${this.containerId}`)) continue;
      const txt = (item.textContent || '').trim();
      if (!txt) continue;
      // モデル選択肢自身は絶対に「思考レベル」項目とみなさない
      if (modelExcludeWords.some(mw => txt.includes(mw))) continue;

      if (keywords.some(kw => txt.includes(kw))) {
        return item;
      }
    }
    return null;
  }

  _waitForSubMenuItem(targetLevel, timeoutMs = 1000, thinkingMenuItem = null) {
    return new Promise(resolve => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const item = this._findTargetSubItem(targetLevel, thinkingMenuItem);
        if (item) {
          clearInterval(interval);
          resolve(item);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 35);
    });
  }

  _findTargetSubItem(targetLevel, thinkingMenuItem = null) {
    // CDKオーバーレイペインが複数ある場合、1段目メニュー以外の最新サブメニューペインを最優先探索
    const overlayPanes = Array.from(document.querySelectorAll('.cdk-overlay-pane, mat-menu-panel, [role="menu"], [role="listbox"]'));
    const reversed = overlayPanes.slice().reverse();
    let sortedContainers = reversed;

    if (thinkingMenuItem) {
      const parentMenu = thinkingMenuItem.closest('mat-menu-panel, [role="menu"], [role="listbox"]');
      const parentPane = thinkingMenuItem.closest('.cdk-overlay-pane');
      const subContainers = reversed.filter(c => c !== parentMenu && c !== parentPane && (!parentPane || !c.contains(thinkingMenuItem)));
      const restContainers = reversed.filter(c => !subContainers.includes(c));
      sortedContainers = subContainers.concat(restContainers);
    }

    const candidateSet = new Set();
    if (sortedContainers.length > 0) {
      for (const container of sortedContainers) {
        const items = container.querySelectorAll(
          '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], button.mat-mdc-menu-item, .mat-menu-item, [class*="menu-item"], button'
        );
        items.forEach(it => candidateSet.add(it));
      }
    } else {
      document.querySelectorAll(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], button.mat-mdc-menu-item, .mat-menu-item, [class*="menu-item"]'
      ).forEach(it => candidateSet.add(it));
    }

    for (const item of candidateSet) {
      if (item.closest(`#${this.containerId}`)) continue;
      if (thinkingMenuItem && (item === thinkingMenuItem || item.contains(thinkingMenuItem))) {
        continue;
      }
      if (item.querySelector('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], button.mat-mdc-menu-item, .mat-menu-item')) {
        continue;
      }
      if (this._isModelOrParentMenuItem(item)) continue;

      if (this._matchesSubItemLevel(item, targetLevel)) {
        return item;
      }
    }

    return null;
  }

  _triggerHover(el) {
    const events = ['mouseenter', 'mouseover', 'pointerenter', 'pointerover', 'mousemove'];
    events.forEach(type => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  }

  async _closeMenus() {
    // アクティブ要素およびドキュメントへ Escape キーを送信
    const activeEl = document.activeElement || document.body;
    [activeEl, document.body, document].forEach(target => {
      if (target && typeof target.dispatchEvent === 'function') {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      }
    });

    // Angular CDK オーバーレイのバックドロップのみを安全にクリック（[class*="backdrop"] は本体要素誤爆のため使用禁止）
    const backdrops = Array.from(document.querySelectorAll('.cdk-overlay-backdrop'));
    backdrops.reverse().forEach(bd => {
      bd.click();
    });

    // 万が一オーバーレイバックドロップが消えずに残って画面のマウス操作を塞いでいる場合のセーフティ解除
    await this._sleep(120);
    document.querySelectorAll('.cdk-overlay-backdrop').forEach(bd => {
      const hasVisibleMenu = document.querySelector('.cdk-overlay-pane [role="menu"], .cdk-overlay-pane mat-menu-panel');
      if (!hasVisibleMenu) {
        bd.style.pointerEvents = 'none';
        bd.remove();
      } else {
        bd.click();
      }
    });
  }

  _waitForElement(selector, timeoutMs = 1000) {
    return new Promise(resolve => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const startTime = Date.now();
      const interval = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(interval);
          resolve(el);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 30);
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  showToast(message, isError = false) {
    const existing = document.getElementById('g-ext-toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'g-ext-toast-msg';
    toast.className = `g-ext-toast ${isError ? 'error' : 'success'}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 250);
    }, 2200);
  }
}

// 登録
window.thinkingSelectorModule = new ThinkingSelectorModule();
window.thinkingSelectorModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('thinkingSelector', window.thinkingSelectorModule);
  }
});
