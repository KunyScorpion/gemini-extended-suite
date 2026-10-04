/**
 * Gemini Extended Suite - Feature 5: 公式使用量・クォータ常時インジケーター
 * 超軽量・安全設計（重いDOM監視や全画面innerText走査を完全撤廃し、ブラウザのフリーズを根絶）
 */

class UsageMonitorModule {
  constructor() {
    this.containerId = 'g-ext-usage-indicator-root';
    this.enabled = true;
    this.isPopoverOpen = false;

    // 公式データ（キャッシュ）
    this.officialData = {
      currentUsage: '1% 使用中',
      currentPercent: 1,
      resetTime: '16:18にリセット',
      weeklyUsage: '4% 使用中',
      weeklyPercent: 4,
      weeklyReset: '10月6日',
      lastSynced: null
    };
  }

  async init() {
    const data = await chrome.storage.local.get(['enableUsageMonitor', 'geminiOfficialQuota']);
    this.enabled = data.enableUsageMonitor !== false;
    if (data.geminiOfficialQuota) {
      this.officialData = { ...this.officialData, ...data.geminiOfficialQuota };
    }
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

    // 右上フローティングバーまたはヘッダーに配置
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
    console.log('[Gemini Extended Suite] Usage Monitor mounted safely');
  }

  createIndicatorElement() {
    const wrap = document.createElement('div');
    wrap.id = this.containerId;
    wrap.className = 'g-ext-usage-indicator';

    wrap.innerHTML = `
      <span style="font-size:11px;font-weight:700;">⚡ 使用量</span>
      <div class="g-ext-usage-meter">
        <div class="g-ext-usage-meter-bar" id="g-ext-usage-bar"></div>
      </div>
      <span id="g-ext-usage-percent-text">${this.officialData.currentPercent || 1}%</span>

      <div class="g-ext-usage-popover" id="g-ext-usage-popover">
        <div style="font-weight:700;font-size:12px;border-bottom:1px solid var(--g-ext-border);padding-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
          <span>📊 Gemini公式 使用量上限</span>
          <span style="font-size:10px;background:rgba(79,128,255,0.2);color:var(--g-ext-primary);padding:1px 5px;border-radius:4px;">PRO</span>
        </div>

        <div style="font-size:12px;color:var(--g-ext-text);margin-top:2px;">
          現在の使用量: <strong id="g-ext-pop-current-val">${this.officialData.currentUsage}</strong>
        </div>
        <div style="font-size:11px;color:var(--g-ext-text-muted);" id="g-ext-pop-current-reset">
          ${this.officialData.resetTime}
        </div>

        <div style="font-size:12px;color:var(--g-ext-text);margin-top:6px;border-top:1px dashed var(--g-ext-border);padding-top:4px;">
          1週間の上限: <strong id="g-ext-pop-weekly-val">${this.officialData.weeklyUsage}</strong>
        </div>
        <div style="font-size:11px;color:var(--g-ext-text-muted);" id="g-ext-pop-weekly-reset">
          ${this.officialData.weeklyReset}
        </div>

        <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--g-ext-border);display:flex;justify-content:space-between;align-items:center;">
          <button type="button" class="g-ext-btn-tiny" id="g-ext-btn-sync-quota-now" style="font-size:11px;">🔄 今すぐ同期</button>
          <button type="button" class="g-ext-btn-tiny" id="g-ext-btn-open-quota-dialog" style="font-size:11px;">公式設定 ↗</button>
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

    // 「今すぐ同期」ボタン
    wrap.querySelector('#g-ext-btn-sync-quota-now').addEventListener('click', (e) => {
      e.stopPropagation();
      this.scrapeDialogIfPresent();
    });

    // 「公式設定」ボタン
    wrap.querySelector('#g-ext-btn-open-quota-dialog').addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerOpenOfficialQuotaModal();
    });

    return wrap;
  }

  updateUI() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const percent = this.officialData.currentPercent || 1;
    const bar = container.querySelector('#g-ext-usage-bar');
    const percentText = container.querySelector('#g-ext-usage-percent-text');
    const curVal = container.querySelector('#g-ext-pop-current-val');
    const curReset = container.querySelector('#g-ext-pop-current-reset');
    const weekVal = container.querySelector('#g-ext-pop-weekly-val');
    const weekReset = container.querySelector('#g-ext-pop-weekly-reset');

    if (bar) {
      bar.style.width = `${Math.min(100, Math.max(3, percent))}%`;
      bar.classList.remove('warning', 'danger');
      if (percent >= 80) bar.classList.add('danger');
      else if (percent >= 60) bar.classList.add('warning');
    }

    if (percentText) percentText.textContent = `${percent}%`;
    if (curVal) curVal.textContent = this.officialData.currentUsage;
    if (curReset) curReset.textContent = this.officialData.resetTime;
    if (weekVal) weekVal.textContent = this.officialData.weeklyUsage;
    if (weekReset) weekReset.textContent = this.officialData.weeklyReset;
  }

  togglePopover() {
    const pop = document.getElementById('g-ext-usage-popover');
    if (!pop) return;
    this.isPopoverOpen = !this.isPopoverOpen;
    pop.classList.toggle('open', this.isPopoverOpen);

    // ポップオーバーを開いた際に、もし画面にダイアログがあれば自動同期
    if (this.isPopoverOpen) {
      this.scrapeDialogIfPresent();
    }
  }

  closePopover() {
    const pop = document.getElementById('g-ext-usage-popover');
    if (pop) {
      pop.classList.remove('open');
      this.isPopoverOpen = false;
    }
  }

  /**
   * ピンポイントでモーダルダイアログのみを検査（超高速・レイアウト再計算ゼロ）
   */
  scrapeDialogIfPresent() {
    // 全div走査を一切行わず、ダイアログ要素のみを1件だけ検索
    const dialog = document.querySelector('mat-dialog-container, [role="dialog"], .cdk-overlay-pane');
    if (!dialog) {
      console.log('[Gemini Extended Suite] No dialog currently open');
      return;
    }

    const text = dialog.textContent || '';
    if (!text.includes('使用量上限') && !text.includes('現在の使用量')) return;

    const currentMatch = text.match(/現在の使用量[^\d]*(\d+)%\s*使用中/);
    const resetMatch = text.match(/(\d{1,2}:\d{2}\s*にリセット)/);
    const weeklyMatch = text.match(/1\s*週間の上限[^\d]*(\d+)%\s*使用中/);
    const weeklyResetMatch = text.match(/(\d+月\d+日の\d{1,2}:\d{2}\s*にリセットされます)/);

    let updated = false;

    if (currentMatch) {
      this.officialData.currentPercent = parseInt(currentMatch[1], 10);
      this.officialData.currentUsage = `${currentMatch[1]}% 使用中`;
      updated = true;
    }

    if (resetMatch) {
      this.officialData.resetTime = resetMatch[1];
      updated = true;
    }

    if (weeklyMatch) {
      this.officialData.weeklyPercent = parseInt(weeklyMatch[1], 10);
      this.officialData.weeklyUsage = `${weeklyMatch[1]}% 使用中`;
      updated = true;
    }

    if (weeklyResetMatch) {
      this.officialData.weeklyReset = weeklyResetMatch[1];
      updated = true;
    }

    if (updated) {
      this.officialData.lastSynced = new Date().toLocaleTimeString();
      chrome.storage.local.set({ geminiOfficialQuota: this.officialData });
      this.updateUI();
      console.log('[Gemini Extended Suite] Safely synced quota:', this.officialData);
    }
  }

  triggerOpenOfficialQuotaModal() {
    // 公式設定ボタンを探してクリック
    const triggers = Array.from(document.querySelectorAll('button, a')).filter(el => {
      const t = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
      return t.includes('使用量') || t.includes('設定');
    });

    if (triggers.length > 0) {
      triggers[0].click();
      setTimeout(() => this.scrapeDialogIfPresent(), 600);
    } else {
      window.open('https://gemini.google.com/app', '_self');
    }
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
