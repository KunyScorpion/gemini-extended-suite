/**
 * Gemini Extended Suite - Feature 5: 公式使用状況・上限常時インジケーター
 * 1週間の上限パーセンテージ取得修正 ＆ アドオン起動時のみ自動クローズ判定実装
 */

class UsageMonitorModule {
  constructor() {
    this.containerId = 'g-ext-usage-indicator-root';
    this.enabled = true;
    this.isPopoverOpen = false;
    this.isFetching = false;
    this.lastFetchTime = 0;
    this.cooldownMs = 2 * 60 * 1000; // 2分間クールダウン

    this.officialData = null;
  }

  async init() {
    const data = await chrome.storage.local.get(['enableUsageMonitor', 'geminiOfficialQuota']);
    this.enabled = data.enableUsageMonitor !== false;
    if (data.geminiOfficialQuota) {
      this.officialData = data.geminiOfficialQuota;
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.geminiOfficialQuota) {
        this.officialData = changes.geminiOfficialQuota.newValue;
        this.isFetching = false;
        this.updateUI();
      }
    });

    // 1. 初回Geminiアクセス時（2秒後）に自動バックグラウンド取得
    setTimeout(() => {
      this.triggerBackgroundTabSync(false);
    }, 2000);

    // 2. スレッド切り替え時（URL変化時）に自動取得（クールダウンあり）
    window.addEventListener('g-ext-url-changed', () => {
      this.triggerBackgroundTabSync(false);
    });

    // 3. 自身が /usage ページそのものを開いている場合の直接スクレイピング
    this.checkIfDirectlyOnUsagePage();
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
          <div style="font-size:11px;color:var(--g-ext-text-muted);padding:8px 0;">読み込み中...</div>
        </div>

        <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--g-ext-border);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:var(--g-ext-text-muted);" id="g-ext-pop-sync-date">--</span>
          <div style="display:flex;gap:4px;">
            <button type="button" class="g-ext-btn-tiny" id="g-ext-btn-refresh-usage" title="裏側で最新データを即時再取得">🔄 更新</button>
            <button type="button" class="g-ext-btn-tiny" id="g-ext-btn-open-usage-page" title="公式ページを別タブで開く">公式 ↗</button>
          </div>
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

    // 🔄 更新ボタン（手動で即座に裏タブ同期実行）
    wrap.querySelector('#g-ext-btn-refresh-usage').addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerBackgroundTabSync(true);
    });

    // 公式ページを開く（ユーザー手動オープン）
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
      if (bar) bar.style.width = '0%';
      if (percentText) percentText.textContent = this.isFetching ? '取得中' : '--%';
      if (syncDateEl) syncDateEl.textContent = this.isFetching ? '取得中...' : '未取得';
      if (contentWrap) {
        contentWrap.innerHTML = `
          <div style="font-size:11px;color:var(--g-ext-text-muted);padding:8px 0;line-height:1.4;">
            ${this.isFetching ? '裏側で使用状況を取得しています...' : '「🔄 更新」を押して最新データを取得してください。'}
          </div>
        `;
      }
      return;
    }

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
          1週間の上限: <strong style="color:var(--g-ext-primary);">${this.officialData.weeklyUsage}</strong>
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

  triggerBackgroundTabSync(force = false) {
    if (window.location.pathname.startsWith('/usage') || window.location.href.includes('/usage')) return;

    const now = Date.now();
    if (!force && (now - this.lastFetchTime < this.cooldownMs)) {
      console.log('[Gemini Extended Suite] Usage sync skipped (cooldown active)');
      return;
    }

    if (this.isFetching) return;
    this.isFetching = true;
    this.lastFetchTime = now;
    this.updateUI();

    console.log('[Gemini Extended Suite] Requesting background tab sync from Service Worker...');
    
    chrome.runtime.sendMessage({ type: 'SYNC_USAGE_BACKGROUND_TAB' }, () => {
      setTimeout(() => {
        this.isFetching = false;
        this.updateUI();
      }, 5500);
    });
  }

  /**
   * /usage ページでの抽出処理
   * アドオン起動時（#g-ext-auto-sync）のみ自動クローズを要請し、手動オープンの場合は閉じない
   */
  checkIfDirectlyOnUsagePage() {
    if (window.location.pathname.startsWith('/usage') || window.location.href.includes('/usage')) {
      const isAutoSync = window.location.hash.includes('g-ext-auto-sync');
      console.log(`[Gemini Extended Suite] On /usage page. Mode: ${isAutoSync ? 'Auto-sync (background)' : 'Manual (user)'}`);

      let hasSynced = false;

      const tryScrape = () => {
        if (hasSynced) return;

        const text = document.body.innerText || '';
        if (!text.includes('現在の使用量') && !text.includes('使用量上限')) return;

        // 1. 現在の使用量
        const currentMatch = text.match(/現在の使用量[\s\S]*?(\d+)%\s*使用中/);
        const resetMatch = text.match(/(\d{1,2}:\d{2}\s*にリセット)/);

        // 2. 1週間の上限（日付の数字で途切れないよう改行を含めてマッチ）
        const weeklyMatch = text.match(/1\s*週間の上限[\s\S]*?(\d+)%\s*使用中/);
        const weeklyResetMatch = text.match(/(\d+月\d+日の\d{1,2}:\d{2}\s*にリセットされます|\d+月\d+日[^\n]*リセット)/);

        // フォールバック: 全体から「(\d+)% 使用中」を順番に抽出
        const allUsageMatches = Array.from(text.matchAll(/(\d+)%\s*使用中/g));

        let currentPercent = null;
        let weeklyPercent = null;

        if (currentMatch) {
          currentPercent = parseInt(currentMatch[1], 10);
        } else if (allUsageMatches.length > 0) {
          currentPercent = parseInt(allUsageMatches[0][1], 10);
        }

        if (weeklyMatch) {
          weeklyPercent = parseInt(weeklyMatch[1], 10);
        } else if (allUsageMatches.length > 1) {
          weeklyPercent = parseInt(allUsageMatches[1][1], 10);
        }

        if (currentPercent !== null) {
          hasSynced = true;
          const now = new Date();
          const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

          const data = {
            currentUsage: `${currentPercent}% 使用中`,
            currentPercent: currentPercent,
            resetTime: resetMatch ? resetMatch[1] : '',
            weeklyUsage: weeklyPercent !== null ? `${weeklyPercent}% 使用中` : '取得完了',
            weeklyPercent: weeklyPercent !== null ? weeklyPercent : 0,
            weeklyReset: weeklyResetMatch ? weeklyResetMatch[1] : '',
            lastSynced: `${timeStr} (${isAutoSync ? '自動' : '手動'})`
          };

          this.officialData = data;
          chrome.storage.local.set({ geminiOfficialQuota: data }, () => {
            console.log('[Gemini Extended Suite] ✅ Saved official /usage data:', data);

            if (isAutoSync) {
              // アドオンが裏で開いた場合のみ、自動クローズをService Workerに要請！
              chrome.runtime.sendMessage({ type: 'USAGE_SYNC_COMPLETE' });
            } else {
              // ユーザーが自分で開いた場合はタブを閉じず、トーストを表示
              this.showSyncToast();
            }
          });
        }
      };

      setTimeout(tryScrape, 800);
      setTimeout(tryScrape, 1800);
      setTimeout(tryScrape, 3200);
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
