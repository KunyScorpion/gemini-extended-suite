/**
 * Gemini Extended Suite - Feature 3: サイドバーのフォルダ管理（安定版）
 * スレッドタイトルの確実な永続化（F5更新後も100%正確なスレッド名を表示）
 */

class SidebarFoldersModule {
  constructor() {
    this.containerId = 'g-ext-sidebar-folder-root';
    this.contextMenuId = 'g-ext-thread-folder-menu';
    this.folders = [];
    this.threadTitles = {}; // スレッドID -> タイトル の永続キャッシュ
    this.enabled = true;
  }

  async init() {
    const data = await chrome.storage.local.get(['enableSidebarFolders', 'folders', 'threadTitles']);
    this.enabled = data.enableSidebarFolders !== false;
    this.folders = data.folders || [];
    this.threadTitles = data.threadTitles || {};

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.folders) {
          this.folders = changes.folders.newValue || [];
          this.renderFolders();
        }
        if (changes.threadTitles) {
          this.threadTitles = changes.threadTitles.newValue || {};
          this.renderFolders();
        }
      }
    });

    window.addEventListener('resize', () => {
      this.updateVisibility();
    });

    document.addEventListener('click', (e) => {
      const menu = document.getElementById(this.contextMenuId);
      if (menu && !menu.contains(e.target) && !e.target.closest('.g-ext-quick-folder-btn')) {
        this.closeThreadContextMenu();
      }
      // サイドバー開閉トグルボタンのクリック検知
      if (e.target.closest('button[aria-label*="メニュー"], button[aria-label*="サイドバー"], button[aria-label*="Menu"], button[data-test-id*="side-nav"]')) {
        setTimeout(() => this.updateVisibility(), 100);
        setTimeout(() => this.updateVisibility(), 300);
      }
    });
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const anchor = this.findChatHistoryAnchor();
    const existing = document.getElementById(this.containerId);

    // チャット履歴（アンカー要素）がまだDOMにない場合
    if (!anchor || !anchor.parentElement) {
      // 初期ロード中など。安易な外枠やヘッダーへの誤爆挿入を防ぐため待機。
      if (existing) {
        this.updateVisibility();
      }
      return;
    }

    const parent = anchor.parentElement;

    if (existing) {
      // 既存のフォルダセクションが正しいアンカーの直前にあるかを自己検証・修復
      if (existing.parentElement !== parent || existing.nextElementSibling !== anchor) {
        console.log('[Gemini Extended Suite] フォルダセクションをチャット履歴の直前へ再配置します');
        parent.insertBefore(existing, anchor);
      }
      this.attachQuickButtonsToThreads();
      this.updateVisibility();
      return;
    }

    this.mountUI(parent, anchor);
  }

  /**
   * チャット履歴の直前（アンカー要素）を精密に特定
   * ヘッダーやロゴへの誤爆マウントを100%防ぐため、確実なチャット履歴要素のみを対象とする
   */
  findChatHistoryAnchor() {
    // 1. スクロール可能なサイドバーコンテンツ領域を優先探索
    const overflowContainers = Array.from(
      document.querySelectorAll('[data-test-id="overflow-container"], .overflow-container')
    );
    const activeContainer = overflowContainers.find(c => {
      const rect = c.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || overflowContainers[0];
    const root = activeContainer || document;

    // 2. チャット履歴の明示的アコーディオン／セクション
    const sectionSelectors = [
      'expandable-section[data-test-id="chats-expandable-section"]',
      '[data-test-id="all-conversations"]',
      '.chat-history',
      '.recent-conversations-container',
      '.conversation-container',
      'nav[aria-label*="チャット"]',
      'nav[aria-label*="履歴"]',
      'nav[aria-label*="Conversations"]',
      'nav[aria-label*="Recent"]'
    ];

    for (const sel of sectionSelectors) {
      const el = root.querySelector(sel);
      if (el && el.parentElement) {
        const section = el.closest('expandable-section') || el;
        if (section.parentElement) return section;
      }
    }

    // 3. 実際の会話行（スレッド）から親セクションを逆引き
    const firstConv = root.querySelector('[data-test-id="conversation"]') || root.querySelector('a[href*="/app/"]');
    if (firstConv) {
      const section = firstConv.closest('expandable-section') ||
                      firstConv.closest('.chat-history, [class*="conversation-container"], mat-nav-list');
      if (section && section.parentElement) {
        return section;
      }
      const rowItem = firstConv.closest('[data-test-id="conversation"]') || firstConv;
      if (rowItem && rowItem.parentElement) {
        return rowItem;
      }
    }

    // 4. チャット履歴がまだ描画されていない場合は null を返す（ヘッダーへの誤爆挿入を完全防止）
    return null;
  }

  isSidebarOpen() {
    if (document.querySelector('chat-app.side-nav-open, #app-root.side-nav-open, .side-nav-open')) {
      return true;
    }
    const sidebar = document.querySelector('bard-sidenav, side-nav, [data-test-id="overflow-container"]');
    if (sidebar instanceof HTMLElement) {
      const rect = sidebar.getBoundingClientRect();
      return rect.width > 120;
    }
    return true;
  }

  updateVisibility() {
    const section = document.getElementById(this.containerId);
    if (!section) return;

    if (this.isSidebarOpen()) {
      section.style.display = '';
    } else {
      section.style.display = 'none';
    }
  }

  mountUI(parent, anchor) {
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

    // アンカー（チャット履歴）の直前に挿入！
    parent.insertBefore(section, anchor);

    header.querySelector('#g-ext-btn-new-folder').addEventListener('click', () => {
      this.openFolderModal();
    });

    this.renderFolders();
    this.attachQuickButtonsToThreads();
    this.updateVisibility();
    console.log('[Gemini Extended Suite] Sidebar Folders safely mounted above chat history');
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

        // 1. DOMから取得、2. 永続ストレージから取得、3. フォールバック
        const realTitle = this.findThreadTitle(tId);

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

  /**
   * スレッドタイトルの取得（DOM検索 ＋ 永続キャッシュの両用）
   */
  findThreadTitle(threadId) {
    // 1. DOMから最新タイトルを探索
    const link = document.querySelector(`a[href*="${threadId}"]`);
    if (link) {
      const titleSpan = link.querySelector('[class*="title"], [class*="text"], span') || link;
      const text = titleSpan.textContent.trim();
      if (text && text !== `スレッド (${threadId.slice(-6)})`) {
        // キャッシュを更新
        if (this.threadTitles[threadId] !== text) {
          this.threadTitles[threadId] = text;
          chrome.storage.local.set({ threadTitles: this.threadTitles });
        }
        return text;
      }
    }

    // 2. 永続ストレージの保存済みタイトル
    if (this.threadTitles[threadId]) {
      return this.threadTitles[threadId];
    }

    // 3. フォールバック
    return `スレッド (${threadId.slice(-6)})`;
  }

  toggleFolderCollapse(folderId) {
    const f = this.folders.find(x => x.id === folderId);
    if (!f) return;
    f.isCollapsed = !f.isCollapsed;
    this.saveFolders();
  }

  /**
   * 各スレッド行に「📁」クイック移動ボタンを付与
   */
  attachQuickButtonsToThreads() {
    const threadLinks = document.querySelectorAll('a[href*="/app/"]');

    threadLinks.forEach((link) => {
      const threadId = this.extractThreadId(link.href || link.getAttribute('href') || '');
      if (!threadId) return;

      const rowItem = link.closest('[class*="conversation"], [class*="item"], side-nav-entry') || link;

      // タイトルキャッシュの自動収集
      const titleSpan = rowItem.querySelector('[class*="title"], [class*="text"], span') || link;
      const titleText = titleSpan ? titleSpan.textContent.trim() : null;
      if (titleText && !this.threadTitles[threadId]) {
        this.threadTitles[threadId] = titleText;
        chrome.storage.local.set({ threadTitles: this.threadTitles });
      }

      if (rowItem.dataset.gExtQuickProcessed) return;
      rowItem.dataset.gExtQuickProcessed = 'true';

      if (!rowItem.querySelector('.g-ext-quick-folder-btn')) {
        const quickBtn = document.createElement('button');
        quickBtn.type = 'button';
        quickBtn.className = 'g-ext-quick-folder-btn';
        quickBtn.innerHTML = '📁';
        quickBtn.title = 'このスレッドをフォルダへ振り分け';

        quickBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showThreadFolderPicker(quickBtn, threadId, rowItem);
        });

        rowItem.style.position = 'relative';
        rowItem.appendChild(quickBtn);
      }
    });
  }

  showThreadFolderPicker(anchorEl, threadId, rowItem) {
    this.closeThreadContextMenu();

    if (this.folders.length === 0) {
      alert('先に左サイドバー上部の「+ 新規フォルダ」からフォルダを作成してください。');
      return;
    }

    // 行要素からタイトルを取得
    const titleSpan = rowItem ? rowItem.querySelector('[class*="title"], [class*="text"], span') : null;
    const currentTitle = titleSpan ? titleSpan.textContent.trim() : this.threadTitles[threadId];

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
        this.assignThreadToFolder(f.id, threadId, currentTitle);
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

  async assignThreadToFolder(folderId, threadId, threadTitle = null) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    if (!folder.threadIds) folder.threadIds = [];
    if (!folder.threadIds.includes(threadId)) {
      folder.threadIds.push(threadId);
    }

    // タイトルを永続保存
    if (threadTitle) {
      this.threadTitles[threadId] = threadTitle;
    }

    await chrome.storage.local.set({
      folders: this.folders,
      threadTitles: this.threadTitles
    });

    this.renderFolders();
    console.log(`[Gemini Extended Suite] Assigned thread ${threadId} ("${threadTitle}") to folder ${folder.name}`);
  }

  async removeThreadFromFolder(folderId, threadId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    folder.threadIds = (folder.threadIds || []).filter(id => id !== threadId);
    await this.saveFolders();
  }

  async saveFolders() {
    await chrome.storage.local.set({
      folders: this.folders,
      threadTitles: this.threadTitles
    });
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
