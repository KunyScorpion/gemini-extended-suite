/**
 * Gemini Extended Suite - Feature 5: 使用量・クォータ常時インジケーター
 * メインチャット画面（/app）での確実な常時表示（右上ツールバーまたはフローティング）
 */

class UsageMonitorModule {
  constructor() {
    this.containerId = 'g-ext-usage-indicator-root';
    this.enabled = true;
    this.dailyLimit = 100;
    this.todayRequests = 0;
    this.isPopoverOpen = false;
  }

  async init() {
    const data = await chrome.storage.local.get(['enableUsageMonitor', 'dailyLimit', 'usageStats']);
    this.enabled = data.enableUsageMonitor !== false;
    this.dailyLimit = data.dailyLimit || 100;

    const todayKey = new Date().toISOString().slice(0, 10);
    const stats = data.usageStats || {};
    this.todayRequests = stats[todayKey] || 0;

    this.setupRequestDetection();
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const existing = document.getElementById(this.containerId);
    if (existing) {
      this.updateUI();
      return;
    }

    // 1. ヘッダーまたはトップバーを探索
    const header = this.findHeaderRightAnchor();
    if (header) {
      this.mountUI(header);
      return;
    }

    // 2. チャット画面（/app/*）のフォールバック: 右上フローティングバー
    this.mountFloatingFallback();
  }

  findHeaderRightAnchor() {
    const selectors = [
      'header [class*="trailing-actions"]',
      'header [class*="actions"]',
      'header [class*="tools"]',
      'header',
      '[role="banner"] [class*="actions"]',
      '[role="banner"]',
      'app-header',
      'mat-toolbar',
      '.top-bar-container',
      '.chat-header',
      '[data-test-id*="header"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetHeight > 0) return el;
    }
    return null;
  }

  mountUI(header) {
    const wrap = this.createIndicatorElement();
    header.appendChild(wrap);
    this.updateUI();
    console.log('[Gemini Extended Suite] Usage Monitor mounted in header');
  }

  mountFloatingFallback() {
    let utilBar = document.getElementById('g-ext-top-floating-bar');
    if (!utilBar) {
      utilBar = document.createElement('div');
      utilBar.id = 'g-ext-top-floating-bar';
      utilBar.className = 'g-ext-top-floating-bar';
      document.body.appendChild(utilBar);
    }

    const wrap = this.createIndicatorElement();
    utilBar.appendChild(wrap);
    this.updateUI();
    console.log('[Gemini Extended Suite] Usage Monitor mounted in floating bar');
  }

  createIndicatorElement() {
    const wrap = document.createElement('div');
    wrap.id = this.containerId;
    wrap.className = 'g-ext-usage-indicator';

    wrap.innerHTML = `
      <span>⚡ QUOTA</span>
      <div class="g-ext-usage-meter">
        <div class="g-ext-usage-meter-bar" id="g-ext-usage-bar"></div>
      </div>
      <span id="g-ext-usage-percent-text">--%</span>

      <div class="g-ext-usage-popover" id="g-ext-usage-popover">
        <div style="font-weight:700;font-size:13px;border-bottom:1px solid var(--g-ext-border);padding-bottom:4px;">
          📊 本日の利用状況ステータス
        </div>
        <div style="font-size:12px;color:var(--g-ext-text);">
          送信リクエスト数: <strong id="g-ext-usage-count-text">0</strong> / ${this.dailyLimit}
        </div>
        <div style="font-size:12px;color:var(--g-ext-text);">
          クォータ残量: <strong id="g-ext-usage-remain-text">100%</strong>
        </div>
        <div style="font-size:11px;color:var(--g-ext-text-muted);margin-top:4px;">
          ※ 日次リセット: 毎日 00:00 (ローカル時刻)
        </div>
      </div>
    `;

    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover();
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        this.closePopover();
      }
    });

    return wrap;
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  updateUI() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const remaining = Math.max(0, this.dailyLimit - this.todayRequests);
    const remainPercent = Math.round((remaining / this.dailyLimit) * 100);

    const bar = container.querySelector('#g-ext-usage-bar');
    const percentText = container.querySelector('#g-ext-usage-percent-text');
    const countText = container.querySelector('#g-ext-usage-count-text');
    const remainText = container.querySelector('#g-ext-usage-remain-text');

    if (bar) {
      bar.style.width = `${remainPercent}%`;
      bar.classList.remove('warning', 'danger');
      if (remainPercent <= 15) {
        bar.classList.add('danger');
      } else if (remainPercent <= 30) {
        bar.classList.add('warning');
      }
    }

    if (percentText) percentText.textContent = `${remainPercent}%`;
    if (countText) countText.textContent = this.todayRequests;
    if (remainText) remainText.textContent = `${remainPercent}%`;
  }

  togglePopover() {
    const pop = document.getElementById('g-ext-usage-popover');
    if (!pop) return;
    this.isPopoverOpen = !this.isPopoverOpen;
    pop.classList.toggle('open', this.isPopoverOpen);
  }

  closePopover() {
    const pop = document.getElementById('g-ext-usage-popover');
    if (pop) {
      pop.classList.remove('open');
      this.isPopoverOpen = false;
    }
  }

  setupRequestDetection() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target;
        if (target && (target.isContentEditable || target.tagName === 'TEXTAREA')) {
          this.recordRequest();
        }
      }
    }, true);

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[aria-label*="送信"], button[aria-label*="Send"], .send-button');
      if (btn) {
        this.recordRequest();
      }
    }, true);
  }

  async recordRequest() {
    const todayKey = new Date().toISOString().slice(0, 10);
    const data = await chrome.storage.local.get(['usageStats']);
    const stats = data.usageStats || {};
    stats[todayKey] = (stats[todayKey] || 0) + 1;
    this.todayRequests = stats[todayKey];

    await chrome.storage.local.set({ usageStats: stats });
    this.updateUI();
  }
}

// 登録
window.usageMonitorModule = new UsageMonitorModule();
window.usageMonitorModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('usageMonitor', window.usageMonitorModule);
  }
});
