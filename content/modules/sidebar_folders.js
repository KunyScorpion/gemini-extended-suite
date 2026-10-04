/**
 * Gemini Extended Suite - Feature 3: サイドバーのフォルダ管理 ＆ ハイブリッド一括リネーム
 * D&Dの確実なイベント伝播 ＋ ワンクリック「フォルダへ移動」メニュー搭載
 */

class SidebarFoldersModule {
  constructor() {
    this.containerId = 'g-ext-sidebar-folder-root';
    this.contextMenuId = 'g-ext-thread-context-menu';
    this.folders = [];
    this.enabled = true;
    this.draggedThreadId = null;
    this.originalThreadTitles = new Map();
  }

  async init() {
    const data = await chrome.storage.local.get(['enableSidebarFolders', 'folders']);
    this.enabled = data.enableSidebarFolders !== false;
    this.folders = data.folders || [];

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.folders) {
        this.folders = changes.folders.newValue || [];
        this.renderFolders();
      }
    });

    window.addEventListener('g-ext-url-changed', () => {
      setTimeout(() => this.reapplyFolderStylesAndTitles(), 500);
    });

    // 右クリック／移動メニュー外クリックでメニューを閉じる
    document.addEventListener('click', () => {
      this.closeThreadContextMenu();
    });
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const existing = document.getElementById(this.containerId);
    if (existing) {
      this.setupDraggableThreads();
      return;
    }

    const sidebarContainer = this.findSidebarHistoryContainer();
    if (!sidebarContainer) return;

    this.mountUI(sidebarContainer);
  }

  findSidebarHistoryContainer() {
    const selectors = [
      'nav[aria-label*="チャット"], nav[aria-label*="履歴"], nav[aria-label*="Conversations"]',
      '.conversation-container',
      '.recent-conversations-container',
      'side-nav',
      'mat-nav-list',
      'nav',
      'aside',
      '[role="navigation"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  mountUI(sidebar) {
    const section = document.createElement('div');
    section.id = this.containerId;
    section.className = 'g-ext-folder-section';

    const header = document.createElement('div');
    header.className = 'g-ext-folder-section-header';
    header.innerHTML = `
      <span class="g-ext-folder-title">📁 フォルダ管理</span>
      <button type="button" class="g-ext-add-folder-btn" id="g-ext-btn-new-folder">+ 新規フォルダ</button>
    `;

    const folderList = document.createElement('div');
    folderList.className = 'g-ext-folder-list';
    folderList.id = 'g-ext-folder-list-body';

    section.appendChild(header);
    section.appendChild(folderList);

    sidebar.insertBefore(section, sidebar.firstChild);

    header.querySelector('#g-ext-btn-new-folder').addEventListener('click', () => {
      this.openFolderModal();
    });

    this.renderFolders();
    this.setupDraggableThreads();
    console.log('[Gemini Extended Suite] Sidebar Folders mounted');
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  renderFolders() {
    const listBody = document.getElementById('g-ext-folder-list-body');
    if (!listBody) return;

    listBody.innerHTML = '';

    if (this.folders.length === 0) {
      listBody.innerHTML = `<div style="font-size:11px;color:var(--g-ext-text-muted);padding:4px;">「+ 新規フォルダ」で作成</div>`;
      return;
    }

    this.folders.forEach((folder) => {
      const node = document.createElement('div');
      node.className = `g-ext-folder-node ${folder.isCollapsed ? 'collapsed' : ''}`;
      node.dataset.folderId = folder.id;

      const header = document.createElement('div');
      header.className = 'g-ext-folder-header';
      header.style.borderLeft = `3px solid ${folder.color || 'var(--g-ext-primary)'}`;

      header.innerHTML = `
        <span class="g-ext-folder-toggle-icon">▼</span>
        <span style="font-size:14px;pointer-events:none;">${folder.icon || '📁'}</span>
        <span class="g-ext-folder-name" title="${folder.name}" style="pointer-events:none;">${folder.name}</span>
        <span class="g-ext-folder-count" style="pointer-events:none;">${(folder.threadIds || []).length}</span>
        <button type="button" class="g-ext-folder-action-btn" title="フォルダ設定・一括リネーム" data-action="settings">⚙️</button>
      `;

      header.addEventListener('click', (e) => {
        if (e.target.closest('.g-ext-folder-action-btn')) return;
        this.toggleFolderCollapse(folder.id);
      });

      header.querySelector('[data-action="settings"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFolderModal(folder);
      });

      // ドロップゾーン登録
      this.setupDropTarget(header, folder);

      const contents = document.createElement('div');
      contents.className = 'g-ext-folder-contents';

      (folder.threadIds || []).forEach((tId) => {
        const item = document.createElement('div');
        item.className = 'g-ext-folder-thread-item';
        item.style.fontSize = '12px';
        item.style.padding = '4px 6px';
        item.style.borderRadius = '4px';
        item.style.color = 'var(--g-ext-text-muted)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.cursor = 'pointer';

        const titleText = this.originalThreadTitles.get(tId) || `スレッド (${tId.slice(-6)})`;
        item.innerHTML = `
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">📄 ${titleText}</span>
          <span style="opacity:0.5;padding:0 4px;" title="フォルダから除外">✕</span>
        `;

        item.querySelector('span:first-child').addEventListener('click', () => {
          this.navigateToThread(tId);
        });

        item.querySelector('span:last-child').addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeThreadFromFolder(folder.id, tId);
        });

        contents.appendChild(item);
      });

      node.appendChild(header);
      node.appendChild(contents);
      listBody.appendChild(node);
    });
  }

  toggleFolderCollapse(folderId) {
    const f = this.folders.find(x => x.id === folderId);
    if (!f) return;
    f.isCollapsed = !f.isCollapsed;
    this.saveFolders();
  }

  setupDropTarget(element, folder) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      element.classList.add('drag-over');
    });

    element.addEventListener('dragenter', (e) => {
      e.preventDefault();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', (e) => {
      if (!element.contains(e.relatedTarget)) {
        element.classList.remove('drag-over');
      }
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');

      const threadId = e.dataTransfer.getData('text/plain') || this.draggedThreadId;
      console.log(`[Gemini Extended Suite] Dropped thread ${threadId} to folder ${folder.name}`);

      if (threadId) {
        this.assignThreadToFolder(folder.id, threadId);
        this.draggedThreadId = null;
      }
    });
  }

  /**
   * 公式サイドバーのスレッド項目をD&D可能にし、右クリック/移動クイックボタンを注入
   */
  setupDraggableThreads() {
    const threadElements = document.querySelectorAll(
      'a[href*="/app/"], [data-test-id*="conversation"], side-nav-entry, [class*="conversation-item"]'
    );

    threadElements.forEach((el) => {
      const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/app/"]');
      if (!link) return;

      const threadId = this.extractThreadId(link.href || link.getAttribute('href') || '');
      if (!threadId) return;

      // 行要素（親またはlinkそのもの）
      const rowItem = el;

      if (!rowItem.dataset.gExtDraggable) {
        rowItem.dataset.gExtDraggable = 'true';
        rowItem.setAttribute('draggable', 'true');

        // キャッシュ
        const titleSpan = rowItem.querySelector('[class*="title"], [class*="text"], span') || rowItem;
        if (titleSpan.textContent) {
          this.originalThreadTitles.set(threadId, titleSpan.textContent.trim());
        }

        // ドラッグ開始
        rowItem.addEventListener('dragstart', (e) => {
          this.draggedThreadId = threadId;
          e.dataTransfer.setData('text/plain', threadId);
          e.dataTransfer.effectAllowed = 'move';
          rowItem.classList.add('g-ext-thread-dragging');
        });

        rowItem.addEventListener('dragend', () => {
          rowItem.classList.remove('g-ext-thread-dragging');
          this.draggedThreadId = null;
        });

        // 確実な代替手段: スレッド横に「📁」クイック振り分けボタンを追加
        if (!rowItem.querySelector('.g-ext-quick-folder-btn')) {
          const quickBtn = document.createElement('button');
          quickBtn.type = 'button';
          quickBtn.className = 'g-ext-quick-folder-btn';
          quickBtn.innerHTML = '📁';
          quickBtn.title = 'このスレッドをフォルダに移動';
          quickBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showThreadFolderPicker(quickBtn, threadId);
          });

          // 行の末尾に挿入
          rowItem.style.position = 'relative';
          rowItem.appendChild(quickBtn);
        }
      }
    });
  }

  /**
   * D&Dに依存しない「📁 フォルダへ移動」クイックピッカー
   */
  showThreadFolderPicker(anchorEl, threadId) {
    this.closeThreadContextMenu();

    if (this.folders.length === 0) {
      alert('先に「+ 新規フォルダ」からフォルダを作成してください。');
      return;
    }

    const menu = document.createElement('div');
    menu.id = this.contextMenuId;
    menu.className = 'g-ext-thread-folder-menu';

    menu.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--g-ext-text-muted);padding:4px 8px;border-bottom:1px solid var(--g-ext-border);">
        移動先フォルダを選択:
      </div>
    `;

    this.folders.forEach(f => {
      const opt = document.createElement('div');
      opt.className = 'g-ext-folder-menu-item';
      opt.innerHTML = `<span>${f.icon || '📁'}</span><span>${f.name}</span>`;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.assignThreadToFolder(f.id, threadId);
        this.closeThreadContextMenu();
      });
      menu.appendChild(opt);
    });

    document.body.appendChild(menu);

    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 200)}px`;
    menu.style.zIndex = '999999';
  }

  closeThreadContextMenu() {
    const menu = document.getElementById(this.contextMenuId);
    if (menu) menu.remove();
  }

  extractThreadId(href) {
    if (!href) return null;
    const match = href.match(/\/app\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  navigateToThread(threadId) {
    window.location.href = `https://gemini.google.com/app/${threadId}`;
  }

  async assignThreadToFolder(folderId, threadId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    if (!folder.threadIds) folder.threadIds = [];
    if (!folder.threadIds.includes(threadId)) {
      folder.threadIds.push(threadId);
      await this.saveFolders();
      console.log(`[Gemini Extended Suite] Assigned thread ${threadId} to folder ${folder.name}`);
    }
  }

  async removeThreadFromFolder(folderId, threadId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    folder.threadIds = (folder.threadIds || []).filter(id => id !== threadId);
    await this.saveFolders();
  }

  async saveFolders() {
    await chrome.storage.local.set({ folders: this.folders });
    this.renderFolders();
  }

  openFolderModal(targetFolder = null) {
    const isEdit = !!targetFolder;
    const folder = isEdit ? { ...targetFolder } : {
      id: `folder-${Date.now()}`,
      name: '',
      icon: '📁',
      color: '#4f80ff',
      threadIds: [],
      isCollapsed: false
    };

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'g-ext-modal-backdrop';

    modalBackdrop.innerHTML = `
      <div class="g-ext-modal">
        <div class="g-ext-modal-header">
          <span class="g-ext-modal-title">${isEdit ? '📁 フォルダ設定 ＆ 一括リネーム' : '📁 新規フォルダ作成'}</span>
          <button type="button" class="g-ext-modal-close">✕</button>
        </div>

        <div class="g-ext-modal-field">
          <label class="g-ext-modal-label">フォルダ名</label>
          <input type="text" id="g-ext-folder-name-input" class="g-ext-input" value="${folder.name}" placeholder="例: 創作・小説、業務リサーチ">
        </div>

        <div style="display:flex;gap:12px;">
          <div class="g-ext-modal-field" style="flex:1;">
            <label class="g-ext-modal-label">アイコン絵文字</label>
            <input type="text" id="g-ext-folder-icon-input" class="g-ext-input" value="${folder.icon || '📁'}">
          </div>
          <div class="g-ext-modal-field" style="flex:1;">
            <label class="g-ext-modal-label">アクセントカラー</label>
            <input type="color" id="g-ext-folder-color-input" class="g-ext-input" style="height:38px;padding:2px;" value="${folder.color || '#4f80ff'}">
          </div>
        </div>

        ${isEdit ? `
        <div style="border-top:1px solid var(--g-ext-border);padding-top:12px;">
          <span class="g-ext-modal-label" style="display:block;margin-bottom:6px;color:var(--g-ext-primary);font-weight:700;">
            ✨ ハイブリッド一括リネーム（タグ/絵文字挿入）
          </span>
          <div style="font-size:12px;color:var(--g-ext-text-muted);margin-bottom:8px;">
            プレフィックス（例: [${folder.icon || '📁'} ${folder.name || 'タグ'}]）をフォルダ内のスレッド名に付与します。
          </div>

          <div class="g-ext-modal-field">
            <label class="g-ext-modal-label">付与する接頭辞（プレフィックス）</label>
            <input type="text" id="g-ext-rename-prefix-input" class="g-ext-input" value="[${folder.icon} ${folder.name}] ">
          </div>

          <div class="g-ext-modal-field">
            <label class="g-ext-modal-label">対象スレッド一覧（個別除外チェック）</label>
            <div class="g-ext-thread-checklist" id="g-ext-rename-thread-list"></div>
          </div>

          <label class="g-ext-checkbox-item" style="margin-top:8px;">
            <input type="checkbox" id="g-ext-sync-official-checkbox">
            <span>Gemini公式サーバー側タイトルも更新する（400msディレイ順次同期）</span>
          </label>

          <div id="g-ext-progress-section" style="display:none;margin-top:8px;">
            <div style="font-size:12px;font-weight:600;display:flex;justify-content:space-between;">
              <span id="g-ext-progress-status">処理中: 0/0</span>
              <span id="g-ext-progress-percent">0%</span>
            </div>
            <div class="g-ext-progress-bar-wrap">
              <div class="g-ext-progress-bar-inner" id="g-ext-progress-bar"></div>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="g-ext-modal-actions">
          ${isEdit ? `<button type="button" class="g-ext-btn g-ext-btn-secondary" id="g-ext-btn-delete-folder" style="color:var(--g-ext-danger);margin-right:auto;">削除</button>` : ''}
          <button type="button" class="g-ext-btn g-ext-btn-secondary" id="g-ext-modal-cancel">キャンセル</button>
          <button type="button" class="g-ext-btn g-ext-btn-primary" id="g-ext-modal-save">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    if (isEdit) {
      const listContainer = modalBackdrop.querySelector('#g-ext-rename-thread-list');
      if (folder.threadIds && folder.threadIds.length > 0) {
        folder.threadIds.forEach(tId => {
          const title = this.originalThreadTitles.get(tId) || `スレッド (${tId})`;
          const row = document.createElement('label');
          row.className = 'g-ext-checkbox-item';
          row.innerHTML = `
            <input type="checkbox" checked value="${tId}" class="g-ext-rename-target-cb">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
          `;
          listContainer.appendChild(row);
        });
      } else {
        listContainer.innerHTML = `<span style="font-size:11px;color:var(--g-ext-text-muted);">スレッドが登録されていません</span>`;
      }
    }

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.g-ext-modal-close').addEventListener('click', close);
    modalBackdrop.querySelector('#g-ext-modal-cancel').addEventListener('click', close);

    if (isEdit) {
      modalBackdrop.querySelector('#g-ext-btn-delete-folder').addEventListener('click', async () => {
        if (confirm(`フォルダ「${folder.name}」を削除してもよろしいですか？（スレッドは保持されます）`)) {
          this.folders = this.folders.filter(f => f.id !== folder.id);
          await this.saveFolders();
          close();
        }
      });
    }

    modalBackdrop.querySelector('#g-ext-modal-save').addEventListener('click', async () => {
      const nameInput = modalBackdrop.querySelector('#g-ext-folder-name-input').value.trim();
      const iconInput = modalBackdrop.querySelector('#g-ext-folder-icon-input').value.trim() || '📁';
      const colorInput = modalBackdrop.querySelector('#g-ext-folder-color-input').value;

      if (!nameInput) {
        alert('フォルダ名を入力してください。');
        return;
      }

      folder.name = nameInput;
      folder.icon = iconInput;
      folder.color = colorInput;

      if (isEdit) {
        const index = this.folders.findIndex(f => f.id === folder.id);
        if (index !== -1) this.folders[index] = folder;

        const prefixInput = modalBackdrop.querySelector('#g-ext-rename-prefix-input')?.value;
        const syncOfficial = modalBackdrop.querySelector('#g-ext-sync-official-checkbox')?.checked;
        const checkedBoxes = Array.from(modalBackdrop.querySelectorAll('.g-ext-rename-target-cb:checked'));
        const targetIds = checkedBoxes.map(cb => cb.value);

        if (prefixInput && targetIds.length > 0) {
          await this.executeHybridRename(modalBackdrop, targetIds, prefixInput, syncOfficial);
        }
      } else {
        this.folders.push(folder);
      }

      await this.saveFolders();
      if (!isEdit || !modalBackdrop.querySelector('#g-ext-sync-official-checkbox')?.checked) {
        close();
      }
    });
  }

  async executeHybridRename(modal, targetThreadIds, prefix, syncOfficial) {
    targetThreadIds.forEach(threadId => {
      const currentTitle = this.originalThreadTitles.get(threadId) || '会話スレッド';
      const newTitle = currentTitle.startsWith(prefix) ? currentTitle : `${prefix}${currentTitle}`;
      this.originalThreadTitles.set(threadId, newTitle);

      const links = document.querySelectorAll(`a[href*="${threadId}"]`);
      links.forEach(link => {
        const titleEl = link.querySelector('[class*="title"], [class*="text"]') || link;
        if (titleEl) titleEl.textContent = newTitle;
      });
    });

    if (!syncOfficial) return;

    const progressSection = modal.querySelector('#g-ext-progress-section');
    const statusText = modal.querySelector('#g-ext-progress-status');
    const percentText = modal.querySelector('#g-ext-progress-percent');
    const progressBar = modal.querySelector('#g-ext-progress-bar');
    const saveBtn = modal.querySelector('#g-ext-modal-save');

    if (progressSection) progressSection.style.display = 'block';
    if (saveBtn) saveBtn.disabled = true;

    const total = targetThreadIds.length;
    for (let i = 0; i < total; i++) {
      const threadId = targetThreadIds[i];
      const newTitle = this.originalThreadTitles.get(threadId);

      const currentIdx = i + 1;
      const pct = Math.round((currentIdx / total) * 100);
      if (statusText) statusText.textContent = `処理中: ${currentIdx}/${total}`;
      if (percentText) percentText.textContent = `${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;

      await this.simulateOfficialRename(threadId, newTitle);
      await new Promise(r => setTimeout(r, 400));
    }

    if (statusText) statusText.textContent = `完了: ${total}/${total}`;
    await new Promise(r => setTimeout(r, 500));
    modal.remove();
  }

  async simulateOfficialRename(threadId, newTitle) {
    const threadLink = document.querySelector(`a[href*="${threadId}"]`);
    if (!threadLink) return;

    const menuBtn = threadLink.parentElement?.querySelector('button[aria-haspopup="menu"], button[aria-label*="メニュー"], button[aria-label*="オプション"]');
    if (!menuBtn) return;

    try {
      menuBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], mat-option'));
      const renameItem = menuItems.find(item => (item.textContent || '').includes('名前を変更') || (item.textContent || '').includes('リネーム') || (item.textContent || '').includes('Rename'));

      if (renameItem) {
        renameItem.click();
        await new Promise(r => setTimeout(r, 100));

        const input = document.querySelector('input[type="text"]:focus, mat-dialog input, [role="dialog"] input');
        if (input) {
          input.value = newTitle;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        }
      }
    } catch (e) {
      console.warn(`[Gemini Extended Suite] Official rename simulation skipped:`, e);
    }
  }

  reapplyFolderStylesAndTitles() {
    this.renderFolders();
    this.setupDraggableThreads();
  }
}

// 登録
window.sidebarFoldersModule = new SidebarFoldersModule();
window.sidebarFoldersModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('sidebarFolders', window.sidebarFoldersModule);
  }
});
