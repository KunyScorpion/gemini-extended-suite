/**
 * Gemini Extended Suite - DOM Observer & SPA Navigation Watcher
 * SPAの非同期DOM再構築やURL遷移を検知し、UIモジュールを確実に再注入する基盤
 */

class GeminiDomObserver {
  constructor() {
    this.modules = new Map();
    this.currentUrl = window.location.href;
    this.observer = null;
    this.debounceTimer = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    console.log('[Gemini Extended Suite] DOM Observer initializing...');

    // 1. SPAのページ遷移（pushState, replaceState, popstate）をフック
    this._hookHistoryEvents();

    // 2. 親DOMに対するMutationObserverの設定
    this._setupMutationObserver();

    // 3. 初回マウント実行
    this.notifyModules();
  }

  /**
   * モジュールを登録（checkAndMount関数を持つオブジェクト）
   */
  registerModule(name, moduleInstance) {
    this.modules.set(name, moduleInstance);
    // 初期化済みであれば即時チェック
    if (this.isInitialized && typeof moduleInstance.checkAndMount === 'function') {
      try {
        moduleInstance.checkAndMount();
      } catch (err) {
        console.error(`[Gemini Extended Suite] Error mounting module ${name}:`, err);
      }
    }
  }

  /**
   * 全登録モジュールに再チェック・再マウントを通知
   */
  notifyModules() {
    for (const [name, mod] of this.modules.entries()) {
      if (typeof mod.checkAndMount === 'function') {
        try {
          mod.checkAndMount();
        } catch (err) {
          console.error(`[Gemini Extended Suite] Failed checkAndMount on ${name}:`, err);
        }
      }
    }
  }

  _hookHistoryEvents() {
    const handleUrlChange = () => {
      if (window.location.href !== this.currentUrl) {
        this.currentUrl = window.location.href;
        console.log('[Gemini Extended Suite] SPA Navigation detected:', this.currentUrl);
        // URL変更イベントをカスタムディスパッチ
        window.dispatchEvent(new CustomEvent('g-ext-url-changed', { detail: { url: this.currentUrl } }));
        setTimeout(() => this.notifyModules(), 300);
      }
    };

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      handleUrlChange();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      handleUrlChange();
      return result;
    };

    window.addEventListener('popstate', handleUrlChange);

    // バックアップ用インターバルチェック（ハッシュ遷移等）
    setInterval(handleUrlChange, 1000);
  }

  _setupMutationObserver() {
    const targetNode = document.body || document.documentElement;

    this.observer = new MutationObserver((mutations) => {
      // DOM更新が頻発するため、150msでデバウンス
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.notifyModules();
      }, 150);
    });

    this.observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  /**
   * ターゲット要素が現れるまで待機するヘルパーユーティリティ
   */
  static waitForElement(selector, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeoutMs);
    });
  }
}

// グローバルインスタンス
window.geminiDomObserver = new GeminiDomObserver();
