/**
 * Gemini Extended Suite - Feature 2: 公式スキル（Skills）ランチャー
 * Gemini公式スキル（https://gemini.google.com/customize/skills）をワンクリックで @メンション呼び出し
 * ポップアップは body 直下ポータル配置（fixed）で入力枠の overflow: hidden を完全回避
 */

class SkillLauncherModule {
  constructor() {
    this.btnWrapId = 'g-ext-skill-launcher-wrap-root';
    this.palettePortalId = 'g-ext-skill-palette-portal';
    this.enabled = true;
    this.isOpen = false;
    this.skills = [];
  }

  async init() {
    const data = await chrome.storage.local.get(['enableSkillLauncher', 'geminiOfficialSkills']);
    this.enabled = data.enableSkillLauncher !== false;
    
    // 公式スキル一覧（未登録の場合は2026/10初期サンプルをセット）
    this.skills = data.geminiOfficialSkills || [
      { id: 's-1', name: 'ディープリサーチ', icon: '🔍', desc: 'Web上の学術・公式ソースを横断調査' },
      { id: 's-2', name: '長編小説・シナリオ創作', icon: '📖', desc: 'プロット構成とキャラクター描写' },
      { id: 's-3', name: 'コードレビュー＆最適化', icon: '💻', desc: 'バグ検出・リファクタリング提案' },
      { id: 's-4', name: 'エグゼクティブ要約', icon: '⚡', desc: '長文・資料の要点箇条書き' }
    ];

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.geminiOfficialSkills) {
        this.skills = changes.geminiOfficialSkills.newValue || [];
        this.renderPaletteItems();
      }
    });

    // スラッシュおよび @ 入力の監視
    this.setupMentionListener();
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const existingBtn = document.getElementById(this.btnWrapId);
    if (!existingBtn) {
      const anchor = this.findAttachmentAnchor();
      if (anchor) this.mountButton(anchor);
    }

    this.ensurePalettePortal();
  }

  findAttachmentAnchor() {
    const selectors = [
      '.toolbox-container',
      '.input-buttons-wrapper',
      '[class*="actions-container"]',
      '[class*="leading-actions"]',
      'rich-textarea',
      '.chat-input-container',
      'form[class*="query"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  mountButton(anchor) {
    const wrap = document.createElement('div');
    wrap.id = this.btnWrapId;
    wrap.className = 'g-ext-skill-launcher-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'g-ext-skill-toggle-btn';
    btn.id = 'g-ext-skill-toggle-trigger';
    btn.innerHTML = `<span>⚡</span><span>スキル (@Skills)</span>`;
    btn.title = 'Gemini公式スキル一覧を開き @メンションで即時呼び出し';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePalette();
    });

    wrap.appendChild(btn);

    if (anchor.tagName === 'RICH-TEXTAREA') {
      anchor.insertAdjacentElement('afterend', wrap);
    } else {
      anchor.appendChild(wrap);
    }

    console.log('[Gemini Extended Suite] Official Skill Launcher Button mounted');
  }

  /**
   * ポップアップを document.body 直下にポータル配置
   * （チャット入力枠の overflow: hidden でクリップされないように fixed 配置）
   */
  ensurePalettePortal() {
    let portal = document.getElementById(this.palettePortalId);
    if (!portal) {
      portal = document.createElement('div');
      portal.id = this.palettePortalId;
      portal.className = 'g-ext-skill-palette g-ext-portal-mode';
      portal.innerHTML = `
        <div class="g-ext-skill-palette-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <span>⚡ 公式スキル選択 (@メンション)</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="g-ext-btn-tiny" id="g-ext-btn-sync-skills" title="スキル設定ページから取得・再読み込み">🔄 同期</button>
            <button type="button" class="g-ext-btn-tiny" id="g-ext-btn-add-skill-manual" title="スキルを手動登録">+ 登録</button>
          </div>
        </div>
        <div style="font-size:11px;color:var(--g-ext-text-muted);padding:4px 8px;border-bottom:1px solid var(--g-ext-border);">
          クリックで入力欄に @スキル名 を挿入して呼び出します
        </div>
        <div class="g-ext-skill-list-wrap" id="g-ext-portal-skill-list"></div>
        <div class="g-ext-skill-palette-footer" style="padding:6px 8px;font-size:11px;border-top:1px solid var(--g-ext-border);display:flex;justify-content:space-between;">
          <a href="https://gemini.google.com/customize/skills" target="_blank" style="color:var(--g-ext-primary);text-decoration:none;">スキル作成・管理 ↗</a>
          <span style="color:var(--g-ext-text-muted);">ESCで閉じる</span>
        </div>
      `;

      document.body.appendChild(portal);

      // 同期ボタンのイベント
      portal.querySelector('#g-ext-btn-sync-skills').addEventListener('click', (e) => {
        e.stopPropagation();
        this.triggerSkillsSync();
      });

      // 手動登録ボタンのイベント
      portal.querySelector('#g-ext-btn-add-skill-manual').addEventListener('click', (e) => {
        e.stopPropagation();
        this.promptAddSkill();
      });

      // パレット外クリックで閉じる
      document.addEventListener('click', (e) => {
        const trigger = document.getElementById('g-ext-skill-toggle-trigger');
        if (this.isOpen && portal && !portal.contains(e.target) && !trigger?.contains(e.target)) {
          this.closePalette();
        }
      });

      // ESCキーで閉じる
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.closePalette();
        }
      });
    }

    this.renderPaletteItems();
  }

  renderPaletteItems() {
    const listWrap = document.getElementById('g-ext-portal-skill-list');
    if (!listWrap) return;

    listWrap.innerHTML = '';

    if (this.skills.length === 0) {
      listWrap.innerHTML = `
        <div style="padding:16px;text-align:center;font-size:12px;color:var(--g-ext-text-muted);">
          登録された公式スキルがありません。<br>
          「+ 登録」または「🔄 同期」をクリックしてください。
        </div>
      `;
      return;
    }

    this.skills.forEach((skill) => {
      const item = document.createElement('div');
      item.className = 'g-ext-skill-item';
      item.innerHTML = `
        <span class="g-ext-skill-icon">${skill.icon || '⚡'}</span>
        <div class="g-ext-skill-content">
          <div class="g-ext-skill-name">@${skill.name}</div>
          ${skill.desc ? `<div class="g-ext-skill-desc">${skill.desc}</div>` : ''}
        </div>
        <span style="font-size:11px;color:var(--g-ext-primary);font-weight:600;">呼び出し</span>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.invokeOfficialSkill(skill.name);
        this.closePalette();
      });

      listWrap.appendChild(item);
    });
  }

  togglePalette() {
    if (this.isOpen) {
      this.closePalette();
    } else {
      this.openPalette();
    }
  }

  openPalette() {
    const trigger = document.getElementById('g-ext-skill-toggle-trigger');
    const portal = document.getElementById(this.palettePortalId);
    if (!portal || !trigger) return;

    // トリガーボタンの位置を取得し、画面上部に展開するように計算
    const rect = trigger.getBoundingClientRect();
    const portalHeight = 280; // 推定高さ
    const topPos = Math.max(10, rect.top - portalHeight - 10);
    const leftPos = Math.max(10, Math.min(rect.left, window.innerWidth - 340));

    portal.style.position = 'fixed';
    portal.style.top = `${topPos}px`;
    portal.style.left = `${leftPos}px`;
    portal.style.zIndex = '999999';
    portal.classList.add('open');
    this.isOpen = true;
  }

  closePalette() {
    const portal = document.getElementById(this.palettePortalId);
    if (portal) {
      portal.classList.remove('open');
      this.isOpen = false;
    }
  }

  /**
   * チャット入力欄に @スキル名 を挿入して公式メンションを発火
   */
  invokeOfficialSkill(skillName) {
    const inputElement = this.findActiveInputElement();
    if (!inputElement) {
      alert('チャット入力枠が見つかりませんでした。入力枠を一度クリックしてください。');
      return;
    }

    inputElement.focus();
    const mentionText = `@${skillName} `;

    if (inputElement.isContentEditable || inputElement.getAttribute('contenteditable') === 'true') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(mentionText);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        inputElement.textContent += mentionText;
      }

      // 入力イベント発火（Angular / Reactモデル更新）
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: '@', bubbles: true }));

      // メンションピルの自動確定シミュレーション（100ms後にEnter送信）
      setTimeout(() => {
        const mentionMenu = document.querySelector('[role="listbox"], [role="menu"], .mention-menu');
        if (mentionMenu) {
          const firstOption = mentionMenu.querySelector('[role="option"], [role="menuitem"]');
          if (firstOption) firstOption.click();
        }
      }, 150);

    } else if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
      const start = inputElement.selectionStart;
      const end = inputElement.selectionEnd;
      const val = inputElement.value;
      inputElement.value = val.substring(0, start) + mentionText + val.substring(end);
      inputElement.selectionStart = inputElement.selectionEnd = start + mentionText.length;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }

    console.log(`[Gemini Extended Suite] Injected official skill mention: @${skillName}`);
  }

  findActiveInputElement() {
    return document.querySelector(
      'rich-textarea [contenteditable="true"], [contenteditable="true"], textarea.ql-editor, textarea, [role="textbox"]'
    );
  }

  /**
   * 公式スキル同期処理
   * 1. /customize/skills の取得
   * 2. チャット画面での @ 入力シミュレーションによる候補収集
   */
  async triggerSkillsSync() {
    const syncBtn = document.getElementById('g-ext-btn-sync-skills');
    if (syncBtn) syncBtn.textContent = '同期中...';

    try {
      // 公式メンションメニューからの動的収集をシミュレート
      const inputEl = this.findActiveInputElement();
      if (inputEl) {
        inputEl.focus();
        // @ を入力して候補リストを誘発
        document.execCommand('insertText', false, '@');
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 400));

        // 現れたメンションメニュー項目を取得
        const menuItems = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], .mention-item'));
        const detectedSkills = [];

        menuItems.forEach(item => {
          const nameEl = item.querySelector('[class*="title"], [class*="name"]') || item;
          const name = nameEl.textContent.trim().replace(/^@/, '');
          if (name && !detectedSkills.some(s => s.name === name)) {
            detectedSkills.push({
              id: `skill-sync-${Date.now()}-${detectedSkills.length}`,
              name: name,
              icon: '⚡',
              desc: 'Gemini公式スキル'
            });
          }
        });

        // 入力した @ を削除して戻す
        document.execCommand('undo');

        if (detectedSkills.length > 0) {
          this.skills = detectedSkills;
          await chrome.storage.local.set({ geminiOfficialSkills: this.skills });
          this.renderPaletteItems();
          alert(`✅ 公式スキル ${detectedSkills.length} 件を自動取得・同期しました！`);
          if (syncBtn) syncBtn.textContent = '🔄 同期';
          return;
        }
      }

      // バックグラウンドで /customize/skills を別タブで開いて同期することを案内
      const openPage = confirm('Geminiスキル設定ページを開いて、作成済みスキルを同期しますか？');
      if (openPage) {
        window.open('https://gemini.google.com/customize/skills', '_blank');
      }
    } catch (err) {
      console.error('[Gemini Extended Suite] Skill sync error:', err);
    } finally {
      if (syncBtn) syncBtn.textContent = '🔄 同期';
    }
  }

  async promptAddSkill() {
    const name = prompt('呼び出したい公式スキル名を入力してください（例: 論文リサーチ、小説執筆）');
    if (!name) return;

    const cleanName = name.replace(/^@/, '').trim();
    const desc = prompt('スキルの簡単な説明（任意）') || '';

    const newSkill = {
      id: `skill-custom-${Date.now()}`,
      name: cleanName,
      icon: '⚡',
      desc: desc
    };

    this.skills.push(newSkill);
    await chrome.storage.local.set({ geminiOfficialSkills: this.skills });
    this.renderPaletteItems();
  }

  setupMentionListener() {
    // ユーザーが @ を直接入力した際にも公式リストの補完をサポート
  }

  removeUI() {
    const btn = document.getElementById(this.btnWrapId);
    if (btn) btn.remove();
    const portal = document.getElementById(this.palettePortalId);
    if (portal) portal.remove();
  }
}

// 登録
window.skillLauncherModule = new SkillLauncherModule();
window.skillLauncherModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('skillLauncher', window.skillLauncherModule);
  }
});
