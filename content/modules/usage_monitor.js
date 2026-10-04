/**
 * Gemini Extended Suite - Feature 5: 公式使用状況・上限常時インジケーター
 * チャット画面のまま、裏側で https://gemini.google.com/usage から自動取得・同期
 * 無駄なループやCPU負荷ゼロで、完全自動バックグラウンド更新を実現
 */

class UsageMonitorModule {
  constructor() {
    this.containerId = 'g-ext-usage-indicator-root';
    this.enabled = true;
    this.isPopoverOpen = false;
    this.isFetching = false;
    this.lastFetchTime = 0;
    this.cooldownMs = 2 * 60 * 1000; // クールダウン: 2分間

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
        this.updateUI();
      }
    });

    // 1. Geminiを開いたとき（初回）に自動バックグラウンド取得（2秒遅延）
    setTimeout(() => {
      this.triggerAutoFetchInBackground(false);
    }, 2500);

    // 2. 新規チャット作成・スレッド切り替え時（URL変化）に自動取得
    window.addEventListener('g-ext-url-changed', () => {
      this.triggerAutoFetchInBackground(false);
    });

    // 3. /usage ページそのものを開いている場合の直接スクレイピング
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

    // 🔄 更新ボタン（手動で即時バックグラウンド取得）
    wrap.querySelector('#g-ext-btn-refresh-usage').addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerAutoFetchInBackground(true);
    });

    // 公式ページを直接開く
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
   * チャット画面のまま、裏側の非表示iframeで https://gemini.google.com/usage を読み取り自動同期
   * @param {boolean} force クールダウンを無視して強制取得するか
   */
  triggerAutoFetchInBackground(force = false) {
    // 自身が /usage ページそのものにいる場合はiframeを作らない
    if (window.location.pathname.startsWith('/usage')) return;

    const now = Date.now();
    if (!force && (now - this.lastFetchTime < this.cooldownMs)) {
      console.log('[Gemini Extended Suite] Usage fetch skipped (within cooldown)');
      return;
    }

    if (this.isFetching) return;
    this.isFetching = true;
    this.lastFetchTime = now;
    this.updateUI();

    console.log('[Gemini Extended Suite] Fetching official usage in background iframe...');

    // 既存の取得用iframeがあれば削除
    const oldIframe = document.getElementById('g-ext-usage-bg-frame');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'g-ext-usage-bg-frame';
    iframe.style.cssText = 'position: absolute; width: 0; height: 0; border: none; opacity: 0; pointer-events: none; left: -9999px;';
    iframe.src = 'https://gemini.google.com/usage';

    let hasExtracted = false;

    const extractFromIframe = () => {
      if (hasExtracted) return;

      try {
        const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!frameDoc || !frameDoc.body) return;

        const text = frameDoc.body.innerText || '';
        if (!text.includes('現在の使用量') && !text.includes('使用量上限')) {
          return; // まだSPAの描画中
        }

        const currentMatch = text.match(/現在の使用量[^\d]*(\d+)%\s*使用中/);
        const resetMatch = text.match(/(\d{1,2}:\d{2}\s*にリセット)/);
        const weeklyMatch = text.match(/1\s*週間の上限[^\d]*(\d+)%\s*使用中/);
        const weeklyResetMatch = text.match(/(\d+月\d+日の\d{1,2}:\d{2}\s*にリセットされます|\d+月\d+日[^\n]*リセット)/);

        if (currentMatch) {
          hasExtracted = true;
          const nowDate = new Date();
          const timeStr = `${nowDate.getHours()}:${String(nowDate.getMinutes()).padStart(2, '0')}`;

          const data = {
            currentUsage: `${currentMatch[1]}% 使用中`,
            currentPercent: parseInt(currentMatch[1], 10),
            resetTime: resetMatch ? resetMatch[1] : '',
            weeklyUsage: weeklyMatch ? `${weeklyMatch[1]}% 使用中` : '',
            weeklyPercent: weeklyMatch ? parseInt(weeklyMatch[1], 10) : 0,
            weeklyReset: weeklyResetMatch ? weeklyResetMatch[1] : '',
            lastSynced: `${timeStr} (自動)`
          };

          this.officialData = data;
          chrome.storage.local.set({ geminiOfficialQuota: data });
          this.isFetching = false;
          this.updateUI();

          console.log('[Gemini Extended Suite] ✅ Background usage sync succeeded:', data);

          // 完了したので直ちに iframe を破棄
          setTimeout(() => iframe.remove(), 200);
        }
      } catch (err) {
        console.warn('[Gemini Extended Suite] Background iframe extraction error:', err);
      }
    };

    iframe.onload = () => {
      // SPAの描画完了を待機して抽出試行
      setTimeout(extractFromIframe, 800);
      setTimeout(extractFromIframe, 1800);
      setTimeout(extractFromIframe, 3000);
    };

    document.body.appendChild(iframe);

    // 最大6秒で安全にクリーンアップ
    setTimeout(() => {
      this.isFetching = false;
      this.updateUI();
      if (document.getElementById('g-ext-usage-bg-frame')) {
        document.getElementById('g-ext-usage-bg-frame').remove();
      }
    }, 6000);
  }

  checkIfDirectlyOnUsagePage() {
    if (window.location.pathname.startsWith('/usage')) {
      const tryScrape = () => {
        const text = document.body.innerText || '';
        const currentMatch = text.match(/現在の使用量[^\d]*(\d+)%\s*使用中/);
        const resetMatch = text.match(/(\d{1,2}:\d{2}\s*にリセット)/);
        const weeklyMatch = text.match(/1\s*週間の上限[^\d]*(\d+)%\s*使用中/);
        const weeklyResetMatch = text.match(/(\d+月\d+日の\d{1,2}:\d{2}\s*にリセットされます|\d+月\d+日[^\n]*リセット)/);

        if (currentMatch) {
          const now = new Date();
          const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
          const data = {
            currentUsage: `${currentMatch[1]}% 使用中`,
            currentPercent: parseInt(currentMatch[1], 10),
            resetTime: resetMatch ? resetMatch[1] : '',
            weeklyUsage: weeklyMatch ? `${weeklyMatch[1]}% 使用中` : '',
            weeklyPercent: weeklyMatch ? parseInt(weeklyMatch[1], 10) : 0,
            weeklyReset: weeklyResetMatch ? weeklyResetMatch[1] : '',
            lastSynced: timeStr
          };
          this.officialData = data;
          chrome.storage.local.set({ geminiOfficialQuota: data });
          this.updateUI();
        }
      };

      setTimeout(tryScrape, 1000);
      setTimeout(tryScrape, 2500);
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
