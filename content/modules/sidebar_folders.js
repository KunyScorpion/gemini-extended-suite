/**
 * Gemini Extended Suite - Feature 3: サイドバーのフォルダ管理（安定版）
 * D&Dおよび一括リネームを完全撤去し、確実・軽快に動作する「📁 クイック移動ボタン」に一本化
 */

class SidebarFoldersModule {
  constructor() {
    this.containerId = 'g-ext-sidebar-folder-root';
    this.contextMenuId = 'g-ext-thread-folder-menu';
    this.folders = [];
    this.enabled = true;
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

    // 画面外クリックでフォルダ選択メニューを閉じる
    document.addEventListener('click', (e) => {
      const menu = document.getElementById(this.contextMenuId);
      if (menu && !menu.contains(e.target) && !e.target.closest('.g-ext-quick-folder-btn')) {
        this.closeThreadContextMenu();
      }
    });
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const existing = document.getElementById(this.containerId);
    if (existing) {
      this.attachQuickButtonsToThreads();
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
    this.attachQuickButtonsToThreads();
    console.log('[Gemini Extended Suite] Stable Sidebar Folders mounted');
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
        <span style="font-size:14px;">${folder.icon || '📁'}</span>
        <span class="g-ext-folder-name" title="${folder.name}">${folder.name}</span>
        <span class="g-ext-folder-count">${(folder.threadIds || []).length}</span>
        <button type="button" class="g-ext-folder-action-btn" title="フォルダ設定・編集" data-action="settings">⚙️</button>
      `;

      header.addEventListener('click', (e) => {
        if (e.target.closest('.g-ext-folder-action-btn')) return;
        this.toggleFolderCollapse(folder.id);
      });

      header.querySelector('[data-action="settings"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFolderModal(folder);
      });

      const contents = document.createElement('div');
      contents.className = 'g-ext-folder-contents';

      // フォルダ内スレッドの表示
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

        // 公式DOMからスレッドのタイトルを探す（なければID略称）
        const realTitle = this.findThreadTitleFromDOM(tId) || `スレッド (${tId.slice(-6)})`;

        item.innerHTML = `
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${realTitle}">📄 ${realTitle}</span>
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

  findThreadTitleFromDOM(threadId) {
    const link = document.querySelector(`a[href*="${threadId}"]`);
    if (link) {
      const titleSpan = link.querySelector('[class*="title"], [class*="text"], span') || link;
      return titleSpan.textContent.trim();
    }
    return null;
  }

  toggleFolderCollapse(folderId) {
    const f = this.folders.find(x => x.id === folderId);
    if (!f) return;
    f.isCollapsed = !f.isCollapsed;
    this.saveFolders();
  }

  /**
   * 各スレッド行に「📁」クイック移動ボタンのみを確実に付与
   */
  attachQuickButtonsToThreads() {
    const threadLinks = document.querySelectorAll('a[href*="/app/"]');

    threadLinks.forEach((link) => {
      const threadId = this.extractThreadId(link.href || link.getAttribute('href') || '');
      if (!threadId) return;

      // 行要素（linkまたは直近のラッパー）
      const rowItem = link.closest('[class*="conversation"], [class*="item"], side-nav-entry') || link;

      if (!rowItem.querySelector('.g-ext-quick-folder-btn')) {
        const quickBtn = document.createElement('button');
        quickBtn.type = 'button';
        quickBtn.className = 'g-ext-quick-folder-btn';
        quickBtn.innerHTML = '📁';
        quickBtn.title = 'このスレッドをフォルダへ振り分け';

        quickBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showThreadFolderPicker(quickBtn, threadId);
        });

        rowItem.style.position = 'relative';
        rowItem.appendChild(quickBtn);
      }
    });
  }

  showThreadFolderPicker(anchorEl, threadId) {
    this.closeThreadContextMenu();

    if (this.folders.length === 0) {
      alert('先に左サイドバー上部の「+ 新規フォルダ」からフォルダを作成してください。');
      return;
    }

    const menu = document.createElement('div');
    menu.id = this.contextMenuId;
    menu.className = 'g-ext-thread-folder-menu';

    menu.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--g-ext-text-muted);padding:4px 8px;border-bottom:1px solid var(--g-ext-border);">
        振り分け先フォルダ:
      </div>
    `;

    this.folders.forEach(f => {
      const isAlreadyIn = (f.threadIds || []).includes(threadId);
      const opt = document.createElement('div');
      opt.className = 'g-ext-folder-menu-item';
      opt.innerHTML = `
        <span>${f.icon || '📁'}</span>
        <span style="flex:1;">${f.name}</span>
        ${isAlreadyIn ? `<span style="font-size:10px;color:var(--g-ext-success);">✓ 登録済</span>` : ''}
      `;

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

  /**
   * シンプルなフォルダ作成・編集モーダル（リネーム機能撤去）
   */
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
      <div class="g-ext-modal" style="max-width:380px;">
        <div class="g-ext-modal-header">
          <span class="g-ext-modal-title">${isEdit ? '📁 フォルダ設定' : '📁 新規フォルダ作成'}</span>
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

        <div class="g-ext-modal-actions">
          ${isEdit ? `<button type="button" class="g-ext-btn g-ext-btn-secondary" id="g-ext-btn-delete-folder" style="color:var(--g-ext-danger);margin-right:auto;">削除</button>` : ''}
          <button type="button" class="g-ext-btn g-ext-btn-secondary" id="g-ext-modal-cancel">キャンセル</button>
          <button type="button" class="g-ext-btn g-ext-btn-primary" id="g-ext-modal-save">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.g-ext-modal-close').addEventListener('click', close);
    modalBackdrop.querySelector('#g-ext-modal-cancel').addEventListener('click', close);

    if (isEdit) {
      modalBackdrop.querySelector('#g-ext-btn-delete-folder').addEventListener('click', async () => {
        if (confirm(`フォルダ「${folder.name}」を削除してもよろしいですか？（スレッド自体は削除されません）`)) {
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
      } else {
        this.folders.push(folder);
      }

      await this.saveFolders();
      close();
    });
  }
}

// 登録
window.sidebarFoldersModule = new SidebarFoldersModule();
window.sidebarFoldersModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('sidebarFolders', window.sidebarFoldersModule);
  }
});
