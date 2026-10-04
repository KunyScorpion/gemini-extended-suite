/**
 * Gemini Extended Suite - Feature 2: スキル・タスク コマンドランチャー
 * 入力欄直下にアウトラインボタンで配置、アコーディオン展開 ＆ スラッシュコマンド補完対応
 */

class SkillLauncherModule {
  constructor() {
    this.containerId = 'g-ext-skill-launcher-root';
    this.slashPopupId = 'g-ext-slash-popup-root';
    this.skills = [];
    this.enabled = true;
    this.isPaletteOpen = false;
    this.selectedIndex = 0;
  }

  async init() {
    const data = await chrome.storage.local.get(['enableSkillLauncher', 'skills']);
    this.enabled = data.enableSkillLauncher !== false;
    this.skills = data.skills || [];

    // ストレージ変更を監視してスキルリストをリアルタイム更新
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.skills) {
        this.skills = changes.skills.newValue || [];
        this.renderPaletteItems();
      }
    });

    this.setupSlashListener();
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const existing = document.getElementById(this.containerId);
    if (existing) return;

    // 入力エリアの下部ツールバーまたは入力欄直下を探索
    const targetAnchor = this.findAttachmentAnchor();
    if (!targetAnchor) return;

    this.mountUI(targetAnchor);
  }

  findAttachmentAnchor() {
    // ツールバー（ファイル添付ボタンやマイクボタンが並ぶ領域）
    const selectors = [
      '.toolbox-container',
      '.input-buttons-wrapper',
      '[class*="actions-container"]',
      '[class*="leading-actions"]',
      'rich-textarea',
      '.chat-input-container'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  mountUI(anchor) {
    const wrap = document.createElement('div');
    wrap.id = this.containerId;
    wrap.className = 'g-ext-skill-launcher-wrap';

    // トリガーボタン（アウトラインスタイル）
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'g-ext-skill-toggle-btn';
    btn.innerHTML = `<span>⚡</span><span>スキル / タスク</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePalette();
    });

    // スキルパレット（フライアウト・アコーディオン）
    const palette = document.createElement('div');
    palette.className = 'g-ext-skill-palette';
    palette.id = 'g-ext-skill-palette-dropdown';

    const header = document.createElement('div');
    header.className = 'g-ext-skill-palette-header';
    header.innerHTML = `<span>⚡ スキル / タスク一覧</span><small style="color:var(--g-ext-text-muted);font-weight:normal;">'/' でも起動</small>`;
    palette.appendChild(header);

    const listWrap = document.createElement('div');
    listWrap.className = 'g-ext-skill-list-wrap';
    palette.appendChild(listWrap);

    wrap.appendChild(btn);
    wrap.appendChild(palette);

    // ドキュメント全体クリックで閉じる
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        this.closePalette();
      }
    });

    // 挿入位置: ツールバー内、または入力エリア直後
    if (anchor.tagName === 'RICH-TEXTAREA') {
      anchor.insertAdjacentElement('afterend', wrap);
    } else {
      anchor.appendChild(wrap);
    }

    this.renderPaletteItems();
    console.log('[Gemini Extended Suite] Skill Launcher mounted');
  }

  renderPaletteItems() {
    const listWrap = document.querySelector(`#${this.containerId} .g-ext-skill-list-wrap`);
    if (!listWrap) return;

    listWrap.innerHTML = '';
    this.skills.forEach((skill) => {
      const item = document.createElement('div');
      item.className = 'g-ext-skill-item';
      item.innerHTML = `
        <span class="g-ext-skill-icon">${skill.icon || '⚡'}</span>
        <div class="g-ext-skill-content">
          <div class="g-ext-skill-name">${skill.name}</div>
          <div class="g-ext-skill-cmd">${skill.command}</div>
          ${skill.description ? `<div class="g-ext-skill-desc">${skill.description}</div>` : ''}
        </div>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.insertCommand(skill.command);
        this.closePalette();
      });

      listWrap.appendChild(item);
    });
  }

  togglePalette() {
    const palette = document.getElementById('g-ext-skill-palette-dropdown');
    if (!palette) return;
    this.isPaletteOpen = !this.isPaletteOpen;
    palette.classList.toggle('open', this.isPaletteOpen);
  }

  closePalette() {
    const palette = document.getElementById('g-ext-skill-palette-dropdown');
    if (palette) {
      palette.classList.remove('open');
      this.isPaletteOpen = false;
    }
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  /**
   * テキストを入力欄のキャレット位置へ安全に挿入
   */
  insertCommand(text) {
    const inputElement = this.findActiveInputElement();
    if (!inputElement) return;

    inputElement.focus();

    if (inputElement.isContentEditable || inputElement.getAttribute('contenteditable') === 'true') {
      // ContentEditable
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      // キャレットを挿入テキストの末尾に移動
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);

      // 入力イベント発行（React / Angularのステート検知用）
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
      const start = inputElement.selectionStart;
      const end = inputElement.selectionEnd;
      const val = inputElement.value;
      inputElement.value = val.substring(0, start) + text + val.substring(end);
      inputElement.selectionStart = inputElement.selectionEnd = start + text.length;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  findActiveInputElement() {
    return document.querySelector('rich-textarea [contenteditable="true"], [contenteditable="true"], textarea.ql-editor, textarea');
  }

  /**
   * Feature 2 追加仕様: スラッシュコマンド（'/' 入力によるインラインポップアップ）
   */
  setupSlashListener() {
    document.addEventListener('keydown', (e) => {
      const popup = document.getElementById(this.slashPopupId);

      // ポップアップ表示中のキーボード操作
      if (popup && popup.classList.contains('active')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveSelection(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveSelection(-1);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          this.selectActiveSlashSkill();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.hideSlashPopup();
          return;
        }
      }
    });

    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target || (!target.isContentEditable && target.tagName !== 'TEXTAREA')) return;

      const text = target.isContentEditable ? target.innerText : target.value;
      
      // 入力末尾またはスラッシュを検知
      if (text && text.endsWith('/')) {
        this.showSlashPopup(target);
      } else {
        const popup = document.getElementById(this.slashPopupId);
        if (popup && !text.includes('/')) {
          this.hideSlashPopup();
        }
      }
    });
  }

  showSlashPopup(anchorElement) {
    let popup = document.getElementById(this.slashPopupId);
    if (!popup) {
      popup = document.createElement('div');
      popup.id = this.slashPopupId;
      popup.className = 'g-ext-slash-popup';
      document.body.appendChild(popup);
    }

    const rect = anchorElement.getBoundingClientRect();
    popup.style.top = `${window.scrollY + rect.top - 200}px`;
    popup.style.left = `${window.scrollX + rect.left + 20}px`;

    this.selectedIndex = 0;
    this.renderSlashItems(popup);
    popup.classList.add('active');
  }

  renderSlashItems(popup) {
    popup.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--g-ext-text-muted);padding:4px 6px;border-bottom:1px solid var(--g-ext-border);margin-bottom:4px;">
        ⚡ スキル / タスクを選択 (↑↓ 選択, Enter 決定)
      </div>
    `;

    this.skills.forEach((skill, idx) => {
      const item = document.createElement('div');
      item.className = `g-ext-skill-item ${idx === this.selectedIndex ? 'selected' : ''}`;
      item.dataset.index = idx;
      item.innerHTML = `
        <span class="g-ext-skill-icon">${skill.icon || '⚡'}</span>
        <div class="g-ext-skill-content">
          <div class="g-ext-skill-name">${skill.name}</div>
          <div class="g-ext-skill-cmd">${skill.command}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectedIndex = idx;
        this.selectActiveSlashSkill();
      });

      popup.appendChild(item);
    });
  }

  moveSelection(delta) {
    const popup = document.getElementById(this.slashPopupId);
    if (!popup) return;

    const items = popup.querySelectorAll('.g-ext-skill-item');
    if (!items.length) return;

    items[this.selectedIndex]?.classList.remove('selected');
    this.selectedIndex = (this.selectedIndex + delta + items.length) % items.length;
    items[this.selectedIndex]?.classList.add('selected');
    items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  selectActiveSlashSkill() {
    const skill = this.skills[this.selectedIndex];
    if (skill) {
      // 直前に入力した '/' を置換するか末尾に追加
      this.insertCommand(skill.command);
    }
    this.hideSlashPopup();
  }

  hideSlashPopup() {
    const popup = document.getElementById(this.slashPopupId);
    if (popup) popup.classList.remove('active');
  }
}

// 登録
window.skillLauncherModule = new SkillLauncherModule();
window.skillLauncherModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('skillLauncher', window.skillLauncherModule);
  }
});
