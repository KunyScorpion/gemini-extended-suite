/**
 * Gemini Extended Suite - Feature 7: 思考レベル (Thinking Level) クイック切替
 * 2026/10仕様変更に伴う3段階の思考レベル（低/中/高）をボタン一発で瞬時に切替
 * 安定した自動マウント・自己位置修復・手動変更への即時追従対応版
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
        if (this.watcherIntervalMs !== 2000) {
          this.startMountWatcher(2000);
        }
      } else if (existing && anchorInfo) {
        // 既に存在するが位置がズレている場合（上段に浮いている等）は正しい位置へ自己修復
        if (existing.parentElement !== anchorInfo.parent || existing.nextElementSibling !== anchorInfo.beforeElement) {
          console.log('[Gemini Extended Suite] 思考レベルボタンをモデル選択の左隣へ自己修復配置します');
          anchorInfo.parent.insertBefore(existing, anchorInfo.beforeElement);
        }
        this.syncActiveLevel();
        // 初回マウント完了・正常配置確認後はポーリング間隔を2000msへ緩和
        if (this.watcherIntervalMs !== 2000) {
          this.startMountWatcher(2000);
        }
      } else if (existing) {
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
      return;
    }

    if (existing) {
      if (existing.parentElement !== anchorInfo.parent || existing.nextElementSibling !== anchorInfo.beforeElement) {
        console.log('[Gemini Extended Suite] 思考レベルボタンをモデル選択の左隣へ再配置します');
        anchorInfo.parent.insertBefore(existing, anchorInfo.beforeElement);
      }
      this.syncActiveLevel();
      return;
    }

    this.mountUI(anchorInfo.parent, anchorInfo.beforeElement);
  }

  /**
   * マウント先アンカーの特定
   * ★モデルピッカーの「上」ではなく、下部ツールバー内の「モデルピッカーコンテナのすぐ左隣（黄色枠）」を100%確実に特定
   */
  findMountAnchor() {
    const modelBtn = this.findModelPickerButton();
    if (!modelBtn) return null;

    this.attachButtonObserver(modelBtn);

    // 1. モデルボタンの周辺から、マイクや送信ボタンが並ぶ「下部ツールバー行コンテナ」を探索
    // ※モデルボタン単体を囲む狭いラッパーの中に突っ込むと縦積み（真上）になってしまうため、
    // 必ずツールバー行コンテナの中で、モデルピッカーラッパーの直前（左隣）に挿入する！
    let toolbar = modelBtn.closest('[class*="actions"], [class*="toolbar"], [class*="trailing"], [class*="bottom"], [class*="buttons"]');

    if (!toolbar) {
      let curr = modelBtn.parentElement;
      while (curr && curr !== document.body && !curr.matches('.chat-input-container, form, rich-textarea, main')) {
        const hasOtherAction = curr.querySelector(
          'button[aria-label*="マイク"], button[aria-label*="音声"], button[aria-label*="送信"], [class*="send"], [class*="mic"]'
        );
        if (hasOtherAction && hasOtherAction !== modelBtn) {
          toolbar = curr;
          break;
        }
        curr = curr.parentElement;
      }
    }

    // 2. ツールバー行の中で、モデルボタンを内包しているトップレベルの子要素（ラッパーまたはボタン自身）を特定
    if (toolbar) {
      let anchorChild = modelBtn;
      while (anchorChild && anchorChild.parentElement !== toolbar) {
        anchorChild = anchorChild.parentElement;
      }

      if (anchorChild && anchorChild.parentElement === toolbar) {
        return {
          parent: toolbar,
          beforeElement: anchorChild // モデルピッカー枠全体の「直前（左隣・同一行）」！
        };
      }
    }

    // 3. フォールバック: 親要素の親（横並び行）
    if (modelBtn.parentElement && modelBtn.parentElement.parentElement) {
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

  findModelPickerButton() {
    // 画面全体からモデル選択ボタンを探索（スコープ制限による取りこぼしを完全防止）
    const buttons = Array.from(document.querySelectorAll('button'));
    const keywords = ['Argon', 'Flash', 'Pro', 'Ultra', 'Gemini'];

    for (const btn of buttons) {
      if (btn.id === this.containerId || btn.closest('[class*="g-ext-"], [id^="g-ext-"]')) continue;
      const text = (btn.textContent || '').trim();
      const hasModelKeyword = keywords.some(kw => text.includes(kw));
      const hasThinkingKeyword = text.includes('高値') || text.includes('安値') || text.includes('中');
      const hasDropdown = !!btn.querySelector('svg, mat-icon, [class*="arrow"], [class*="expand"]') ||
                          btn.getAttribute('aria-haspopup') === 'menu' ||
                          btn.getAttribute('aria-expanded') !== null;

      if ((hasModelKeyword || hasThinkingKeyword) && (hasDropdown || text.length < 35)) {
        return btn;
      }
    }

    const attrBtn = document.querySelector(
      'button[aria-label*="モデル"], button[aria-label*="Model"], button[data-test-id*="model"], [class*="model-picker-btn"], [class*="model-select"]'
    );
    if (attrBtn && !attrBtn.closest(`#${this.containerId}`)) return attrBtn;

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
        <button type="button" class="g-ext-thinking-btn" data-level="low" title="思考レベル: 低 (安値) - 時間をかけず効率的に回答">低</button>
        <button type="button" class="g-ext-thinking-btn" data-level="medium" title="思考レベル: 中 - バランスを取って詳しく回答">中</button>
        <button type="button" class="g-ext-thinking-btn" data-level="high" title="思考レベル: 高 (高値) - 徹底的に詳しく思考・回答">高</button>
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
   * 現在選択されている思考レベルをボタンの表示やモデルピッカーから検知し同期
   */
  syncActiveLevel() {
    const root = document.getElementById(this.containerId);
    if (!root) return;

    const modelBtn = this.findModelPickerButton();
    if (modelBtn && this.observedBtn !== modelBtn) {
      this.attachButtonObserver(modelBtn);
    }

    const btnText = modelBtn ? (modelBtn.textContent || '').trim() : '';

    let detectedLevel = null;

    // 「高値」「高」「High」の厳密検知（「高度な推論」等の誤認を防止）
    if (btnText.includes('高値') || /high/i.test(btnText) || /[\s\u3000]高$/i.test(btnText) || /[\s\u3000]高[\s\u3000]/i.test(btnText)) {
      detectedLevel = 'high';
    } else if (btnText.includes('中') || /medium|balanced/i.test(btnText)) {
      detectedLevel = 'medium';
    } else if (btnText.includes('安値') || btnText.includes('低') || /low|fast/i.test(btnText)) {
      detectedLevel = 'low';
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
   * 思考レベルを自動選択（公式メニューをバックグラウンドで操作）
   */
  async selectThinkingLevel(targetLevel) {
    if (this.isSwitching) return;
    if (this.currentLevel === targetLevel) {
      const levelNames = { low: '低 (安値)', medium: '中', high: '高 (高値)' };
      this.showToast(`思考レベルは既に「${levelNames[targetLevel]}」です`);
      return;
    }

    this.isSwitching = true;
    this.updateButtonLoading(targetLevel, true);

    try {
      const success = await this._performSwitch(targetLevel);
      if (success) {
        this.currentLevel = targetLevel;
        this.syncActiveLevel();
        const levelNames = { low: '低 (安値)', medium: '中', high: '高 (高値)' };
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

    // 3. 既に1段目のメニュー内に目的のレベル項目が表示されているかチェック
    await this._sleep(60);
    let targetSubItem = this._findTargetSubItem(targetLevel);

    if (!targetSubItem) {
      // メニューから「思考レベル」親項目を探索
      const thinkingMenuItem = this._findThinkingMenuItem();
      if (thinkingMenuItem) {
        // 4a. まずホバーでサブメニュー展開を試みる（ホバーで開くメニューをクリックして閉じてしまうのを防ぐ）
        this._triggerHover(thinkingMenuItem);
        targetSubItem = await this._waitForSubMenuItem(targetLevel, 350);

        // 4b. ホバーだけで開かない場合はクリックして展開を待つ
        if (!targetSubItem) {
          thinkingMenuItem.click();
          targetSubItem = await this._waitForSubMenuItem(targetLevel, 1000);
        }
      } else {
        // 「思考レベル」親項目が見つからない場合も少し待って直接探索
        targetSubItem = await this._waitForSubMenuItem(targetLevel, 600);
      }
    }

    if (!targetSubItem) {
      console.warn(`[Gemini Extended Suite] Target thinking item for level "${targetLevel}" not found`);
      await this._closeMenus();
      return false;
    }

    // 5. 目的の思考レベルをクリック！
    targetSubItem.click();

    // 6. メニューが残っていれば確実に閉じる
    await this._sleep(80);
    await this._closeMenus();

    // 7. 変更後のステータスを即時同期
    setTimeout(() => this.syncActiveLevel(), 80);
    setTimeout(() => this.syncActiveLevel(), 250);

    return true;
  }

  _findThinkingMenuItem() {
    const items = Array.from(document.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], button.mat-mdc-menu-item, .mat-menu-item, [class*="menu-item"]'
    ));

    const keywords = ['思考レベル', 'Thinking level', 'Thinking', '思考'];
    for (const item of items) {
      if (item.closest(`#${this.containerId}`)) continue;
      const txt = (item.textContent || '').trim();
      // モデル選択肢自身（3.1 Pro 等）は絶対に「思考レベル」項目とみなさない
      if (txt.includes('Pro') || txt.includes('Flash') || txt.includes('Argon')) continue;

      if (keywords.some(kw => txt.includes(kw))) {
        return item;
      }
    }
    return null;
  }

  _waitForSubMenuItem(targetLevel, timeoutMs = 1000) {
    return new Promise(resolve => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const item = this._findTargetSubItem(targetLevel);
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

  _findTargetSubItem(targetLevel) {
    // CDKオーバーレイペインが複数ある場合、最新（最後）のオーバーレイペインを優先探索
    const overlayPanes = Array.from(document.querySelectorAll('.cdk-overlay-pane, mat-menu-panel, [role="menu"], [role="listbox"]'));
    const sortedContainers = overlayPanes.reverse();

    let candidateItems = [];
    if (sortedContainers.length > 0) {
      for (const container of sortedContainers) {
        const items = Array.from(container.querySelectorAll(
          '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], button.mat-mdc-menu-item, .mat-menu-item, [class*="menu-item"], button'
        ));
        candidateItems = candidateItems.concat(items);
      }
    } else {
      candidateItems = Array.from(document.querySelectorAll(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], button.mat-mdc-menu-item, .mat-menu-item, [class*="menu-item"]'
      ));
    }

    // モデル項目をブラックリスト化して誤爆を防止（「高度」単体は「高」の説明に含まれる場合があるため「高度な推論」に限定）
    const modelBlacklist = [
      'pro', 'flash', 'argon', 'ultra',
      '高度な推論', 'すばやく回答', 'あらゆる場面', '複雑なタスク',
      '3.5', '3.8', '3.1', '4 argon'
    ];

    for (const item of candidateItems) {
      if (item.closest(`#${this.containerId}`)) continue;
      const rawText = (item.textContent || '').trim();
      if (!rawText) continue;
      const lower = rawText.toLowerCase();

      // 「思考レベル」親メニュー自身は除外
      if (rawText.includes('思考レベル') || rawText.includes('思考の深さ') || lower.includes('thinking level')) continue;

      // モデル選択肢（3.1 Pro、Flash等）は除外
      const isModelOption = modelBlacklist.some(kw => lower.includes(kw));
      if (isModelOption) continue;

      // 「思考」という単語自体の文字を除いたテキストで判定
      const cleanedText = rawText.replace(/思考レベル|思考/g, '').trim();

      // 目的のレベルに応じたマッチング
      if (targetLevel === 'high') {
        if (cleanedText.includes('高値') || cleanedText.includes('高') || cleanedText.includes('徹底的') || /\b(high|deep|max)\b/i.test(lower)) {
          return item;
        }
      } else if (targetLevel === 'medium') {
        if (cleanedText.includes('中') || cleanedText.includes('標準') || cleanedText.includes('バランス') || /\b(medium|balanced|standard)\b/i.test(lower)) {
          return item;
        }
      } else if (targetLevel === 'low') {
        if (cleanedText.includes('安値') || cleanedText.includes('低') || cleanedText.includes('最小') || cleanedText.includes('時間をかけず') || /\b(low|fast|min|light)\b/i.test(lower)) {
          return item;
        }
      }
    }

    return null;
  }

  _triggerHover(el) {
    const events = ['mouseenter', 'mouseover', 'pointerenter', 'pointerover'];
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
