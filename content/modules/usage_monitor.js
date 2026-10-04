/**
 * Gemini Extended Suite - Feature 5: 公式使用量・クォータ常時インジケーター
 * https://gemini.google.com/usage から本物の公式使用状況データを同期・表示
 * ダミー値や固定値は一切排除し、正確な公式データのみを反映
 */

class UsageMonitorModule {
  constructor() {
    this.containerId = 'g-ext-usage-indicator-root';
    this.enabled = true;
    this.isPopoverOpen = false;
    this.officialData = null; // null = 未同期
  }

  async init() {
    const data = await chrome.storage.local.get(['enableUsageMonitor', 'geminiOfficialQuota']);
    this.enabled = data.enableUsageMonitor !== false;
    if (data.geminiOfficialQuota) {
      this.officialData = data.geminiOfficialQuota;
    }

    // ストレージ変更監視（https://gemini.google.com/usage で更新されたら即座に反映）
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.geminiOfficialQuota) {
        this.officialData = changes.geminiOfficialQuota.newValue;
        this.updateUI();
      }
    });

    // 自身が /usage ページにいる場合はDOMからスクレイピング実行
    this.checkIfOnUsagePage();
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
  }

  createIndicatorElement() {
    const wrap = document.createElement('div');
    wrap.id = this.containerId;
    wrap.className = 'g-ext-usage-indicator';

    wrap.innerHTML = `
      <span style="font-size:11px;font-weight:700;">⚡ 使用状況</span>
      <div class="g-ext-usage-meter">
        <div class="g-ext-usage-meter-bar" id="g-ext-usage-bar"></div>
      </div>
      <span id="g-ext-usage-percent-text">--%</span>

      <div class="g-ext-usage-popover" id="g-ext-usage-popover">
        <div style="font-weight:700;font-size:12px;border-bottom:1px solid var(--g-ext-border);padding-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
          <span>📊 Gemini公式 使用量上限</span>
          <span style="font-size:10px;background:rgba(79,128,255,0.2);color:var(--g-ext-primary);padding:1px 5px;border-radius:4px;">PRO</span>
        </div>

        <div id="g-ext-pop-content-wrap">
          <!-- JSで動的更新 -->
        </div>

        <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--g-ext-border);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:var(--g-ext-text-muted);" id="g-ext-pop-sync-date">未同期</span>
          <button type="button" class="g-ext-btn-tiny" id="g-ext-btn-open-usage-page" style="font-size:11px;font-weight:600;">使用状況を開く ↗</button>
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

    // 「使用状況を開く ↗」ボタン（公式URL: https://gemini.google.com/usage へ確実に遷移）
    wrap.querySelector('#g-ext-btn-open-usage-page').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open('https://gemini.google.com/usage', '_blank');
    });

    return wrap;
  }

  updateUI() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const bar = container.querySelector('#g-ext-usage-bar');
    const percentText = container.querySelector('#g-ext-usage-percent-text');
    const contentWrap = container.querySelector('#g-ext-pop-content-wrap');
    const syncDateEl = container.querySelector('#g-ext-pop-sync-date');

    if (!this.officialData) {
      // 未同期状態
      if (bar) bar.style.width = '0%';
      if (percentText) percentText.textContent = '未同期';
      if (syncDateEl) syncDateEl.textContent = '未取得';
      if (contentWrap) {
        contentWrap.innerHTML = `
          <div style="font-size:11px;color:var(--g-ext-text-muted);padding:8px 0;line-height:1.4;">
            公式データがまだ同期されていません。<br>
            下の「<strong>使用状況を開く ↗</strong>」をクリックして同期してください。
          </div>
        `;
      }
      return;
    }

    // 同期済みデータがある場合
    const percent = this.officialData.currentPercent || 0;
    if (bar) {
      bar.style.width = `${Math.min(100, Math.max(3, percent))}%`;
      bar.classList.remove('warning', 'danger');
      if (percent >= 80) bar.classList.add('danger');
      else if (percent >= 60) bar.classList.add('warning');
    }

    if (percentText) percentText.textContent = `${percent}%`;
    if (syncDateEl) syncDateEl.textContent = `同期: ${this.officialData.lastSynced || '完了'}`;

    if (contentWrap) {
      contentWrap.innerHTML = `
        <div style="font-size:12px;color:var(--g-ext-text);margin-top:4px;">
          現在の使用量: <strong style="color:var(--g-ext-primary);">${this.officialData.currentUsage}</strong>
        </div>
        <div style="font-size:11px;color:var(--g-ext-text-muted);">
          ${this.officialData.resetTime || ''}
        </div>

        <div style="font-size:12px;color:var(--g-ext-text);margin-top:6px;border-top:1px dashed var(--g-ext-border);padding-top:4px;">
          1週間の上限: <strong>${this.officialData.weeklyUsage}</strong>
        </div>
        <div style="font-size:11px;color:var(--g-ext-text-muted);">
          ${this.officialData.weeklyReset || ''}
        </div>
      `;
    }
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

  /**
   * 現在のページが https://gemini.google.com/usage の場合、公式DOMから正確に抽出
   */
  checkIfOnUsagePage() {
    if (window.location.pathname.startsWith('/usage') || window.location.href.includes('/usage')) {
      console.log('[Gemini Extended Suite] On official /usage page. Scraping official quota...');

      const tryScrape = () => {
        const text = document.body.innerText;
        if (!text || (!text.includes('現在の使用量') && !text.includes('使用量上限'))) {
          return false;
        }

        const currentMatch = text.match(/現在の使用量[^\d]*(\d+)%\s*使用中/);
        const resetMatch = text.match(/(\d{1,2}:\d{2}\s*にリセット)/);
        const weeklyMatch = text.match(/1\s*週間の上限[^\d]*(\d+)%\s*使用中/);
        const weeklyResetMatch = text.match(/(\d+月\d+日の\d{1,2}:\d{2}\s*にリセットされます|\d+月\d+日[^\n]*リセット)/);

        if (currentMatch) {
          const now = new Date();
          const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

          const scraped = {
            currentUsage: `${currentMatch[1]}% 使用中`,
            currentPercent: parseInt(currentMatch[1], 10),
            resetTime: resetMatch ? resetMatch[1] : '',
            weeklyUsage: weeklyMatch ? `${weeklyMatch[1]}% 使用中` : '',
            weeklyPercent: weeklyMatch ? parseInt(weeklyMatch[1], 10) : 0,
            weeklyReset: weeklyResetMatch ? weeklyResetMatch[1] : '',
            lastSynced: timeStr
          };

          this.officialData = scraped;
          chrome.storage.local.set({ geminiOfficialQuota: scraped });
          this.updateUI();

          console.log('[Gemini Extended Suite] ✅ Successfully scraped official /usage data:', scraped);
          this.showSyncToast();
          return true;
        }
        return false;
      };

      // ページ読み込み完了時とDOM描画時に試行
      setTimeout(tryScrape, 800);
      setTimeout(tryScrape, 2000);
      setTimeout(tryScrape, 4000);
    }
  }

  showSyncToast() {
    if (document.getElementById('g-ext-sync-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'g-ext-sync-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e2230;
      color: #10b981;
      border: 1px solid #10b981;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      z-index: 999999;
      animation: g-ext-fadeIn 0.2s ease-out;
    `;
    toast.innerHTML = '✅ Gemini Extended Suite に最新の使用状況を同期しました';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }
}

// 登録
window.usageMonitorModule = new UsageMonitorModule();
window.usageMonitorModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('usageMonitor', window.usageMonitorModule);
  }
});
