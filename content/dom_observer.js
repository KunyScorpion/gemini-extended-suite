/**
 * Gemini Extended Suite - DOM Observer & SPA Navigation Watcher
 * SPAの非同期DOM再構築やURL遷移を検知し、安全にUIモジュールを注入（自己誘発ループ完全防止）
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

    console.log('[Gemini Extended Suite] DOM Observer initializing safely...');

    this._hookHistoryEvents();
    this._setupMutationObserver();

    // 初回マウント（SPAの段階的レンダリングに追従）
    setTimeout(() => this.notifyModules(), 200);
    setTimeout(() => this.notifyModules(), 600);
    setTimeout(() => this.notifyModules(), 1500);
  }

  registerModule(name, moduleInstance) {
    this.modules.set(name, moduleInstance);
    if (this.isInitialized && typeof moduleInstance.checkAndMount === 'function') {
      try {
        moduleInstance.checkAndMount();
      } catch (err) {
        console.error(`[Gemini Extended Suite] Error mounting module ${name}:`, err);
      }
    }
  }

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
        window.dispatchEvent(new CustomEvent('g-ext-url-changed', { detail: { url: this.currentUrl } }));
        setTimeout(() => this.notifyModules(), 400);
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
  }

  _setupMutationObserver() {
    const targetNode = document.body || document.documentElement;

    this.observer = new MutationObserver((mutations) => {
      // 拡張機能自身のUI変更のみの場合は無視（無限ループを完全防止）
      let hasExternalChange = false;
      for (const m of mutations) {
        if (m.target && m.target.className && typeof m.target.className === 'string' && m.target.className.includes('g-ext-')) {
          continue;
        }
        hasExternalChange = true;
        break;
      }

      if (!hasExternalChange) return;

      // 安全な300msデバウンス
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.notifyModules();
      }, 300);
    });

    this.observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }
}

// グローバルインスタンス
window.geminiDomObserver = new GeminiDomObserver();
