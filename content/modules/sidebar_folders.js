/**
 * Gemini Extended Suite - Feature 3: サイドバーのフォルダ管理 ＆ ハイブリッド一括リネーム
 * 左サイドバーにフォルダ構造を追加、D&D整理、タグ・絵文字一括整形（ローカル即時 ＋ サーバー同期）
 */

class SidebarFoldersModule {
  constructor() {
    this.containerId = 'g-ext-sidebar-folder-root';
    this.folders = [];
    this.enabled = true;
    this.draggedThread = null;
    this.originalThreadTitles = new Map(); // スレッドID -> 元のタイトル
  }

  async init() {
    const data = await chrome.storage.local.get(['enableSidebarFolders', 'folders']);
    this.enabled = data.enableSidebarFolders !== false;
    this.folders = data.folders || [];

    // ストレージ変更監視
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.folders) {
        this.folders = changes.folders.newValue || [];
        this.renderFolders();
      }
    });

    // SPA遷移時のタイトル再適用監視
    window.addEventListener('g-ext-url-changed', () => {
      setTimeout(() => this.reapplyFolderStylesAndTitles(), 500);
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
    // 2026/Post-Gemini サイドバーのチャット履歴一覧の親セレクタ
    const selectors = [
      'nav[aria-label*="チャット"], nav[aria-label*="履歴"], nav[aria-label*="Conversations"]',
      '.conversation-container',
      '.recent-conversations-container',
      'side-nav',
      'mat-nav-list',
      'nav',
      'aside'
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

    // サイドバーの先頭（チャット一覧の上部）に挿入
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
      listBody.innerHTML = `<div style="font-size:11px;color:var(--g-ext-text-muted);padding:4px;">フォルダがありません</div>`;
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
        <button type="button" class="g-ext-folder-action-btn" title="フォルダ設定・一括リネーム" data-action="settings">⚙️</button>
      `;

      // フォルダクリックで折りたたみ
      header.addEventListener('click', (e) => {
        if (e.target.closest('.g-ext-folder-action-btn')) return;
        this.toggleFolderCollapse(folder.id);
      });

      // 設定・一括リネームボタン
      header.querySelector('[data-action="settings"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFolderModal(folder);
      });

      // ドラッグ＆ドロップ受領（スレッドの振り分け）
      this.setupDropTarget(header, folder);

      const contents = document.createElement('div');
      contents.className = 'g-ext-folder-contents';

      // フォルダ所属スレッドアイテムの描画
      (folder.threadIds || []).forEach((tId) => {
        const item = document.createElement('div');
        item.className = 'g-ext-folder-thread-item';
        item.style.fontSize = '12px';
        item.style.padding = '3px 6px';
        item.style.color = 'var(--g-ext-text-muted)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.cursor = 'pointer';

        const titleText = this.originalThreadTitles.get(tId) || `スレッド (${tId.slice(-6)})`;
        item.innerHTML = `
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">📄 ${titleText}</span>
          <span style="opacity:0.4;cursor:pointer;" title="フォルダから解除">✕</span>
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
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');
      if (this.draggedThread) {
        this.assignThreadToFolder(folder.id, this.draggedThread);
        this.draggedThread = null;
      }
    });
  }

  /**
   * 公式サイドバー内のスレッドリンクをドラッグ可能にする
   */
  setupDraggableThreads() {
    const threadElements = document.querySelectorAll('a[href*="/app/"], [data-test-id*="conversation"]');
    threadElements.forEach((el) => {
      if (el.dataset.gExtDraggable) return;
      el.dataset.gExtDraggable = 'true';
      el.draggable = true;

      const threadId = this.extractThreadId(el.href || el.getAttribute('href') || '');

      // タイトルキャッシュ
      const titleSpan = el.querySelector('[class*="title"], [class*="text"]') || el;
      if (threadId && titleSpan.textContent) {
        this.originalThreadTitles.set(threadId, titleSpan.textContent.trim());
      }

      el.addEventListener('dragstart', (e) => {
        this.draggedThread = threadId;
        el.classList.add('g-ext-thread-dragging');
        e.dataTransfer.setData('text/plain', threadId);
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('g-ext-thread-dragging');
      });

      // コンテキストメニュー用右クリックイベント
      el.addEventListener('contextmenu', (e) => {
        // 必要に応じてクイック振り分けメニューを表示
      });
    });
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
   * フォルダ作成・設定 ＆ ハイブリッド一括リネームモーダル
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
      <div class="g-ext-modal">
        <div class="g-ext-modal-header">
          <span class="g-ext-modal-title">${isEdit ? '📁 フォルダ設定 ＆ 一括リネーム' : '📁 新規フォルダ作成'}</span>
          <button type="button" class="g-ext-modal-close">✕</button>
        </div>

        <div class="g-ext-modal-field">
          <label class="g-ext-modal-label">フォルダ名</label>
          <input type="text" id="g-ext-folder-name-input" class="g-ext-input" value="${folder.name}" placeholder="例: 小説・創作、業務リサーチ">
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
        <!-- Feature 3.2: ハイブリッド一括リネームセクション -->
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
            <div class="g-ext-thread-checklist" id="g-ext-rename-thread-list">
              <!-- JSで動的生成 -->
            </div>
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

    // スレッドチェックリストの挿入
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

    // イベント登録
    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.g-ext-modal-close').addEventListener('click', close);
    modalBackdrop.querySelector('#g-ext-modal-cancel').addEventListener('click', close);

    // 削除ボタン
    if (isEdit) {
      modalBackdrop.querySelector('#g-ext-btn-delete-folder').addEventListener('click', async () => {
        if (confirm(`フォルダ「${folder.name}」を削除してもよろしいですか？（スレッドは保持されます）`)) {
          this.folders = this.folders.filter(f => f.id !== folder.id);
          await this.saveFolders();
          close();
        }
      });
    }

    // 保存・一括リネーム実行
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

        // 一括リネームの実行判定
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

  /**
   * ハイブリッド一括リネーム処理
   * 1. ローカル即時反映（DOM書き換え、ゼロ遅延）
   * 2. 公式サーバー同期（400msディレイ順次処理）
   */
  async executeHybridRename(modal, targetThreadIds, prefix, syncOfficial) {
    console.log(`[Gemini Extended Suite] Executing hybrid rename on ${targetThreadIds.length} threads`);

    // 1. ローカル即時反映（DOM上のタイトル書き換え）
    targetThreadIds.forEach(threadId => {
      const currentTitle = this.originalThreadTitles.get(threadId) || '会話スレッド';
      const newTitle = currentTitle.startsWith(prefix) ? currentTitle : `${prefix}${currentTitle}`;
      this.originalThreadTitles.set(threadId, newTitle);

      // DOM要素を探して更新
      const links = document.querySelectorAll(`a[href*="${threadId}"]`);
      links.forEach(link => {
        const titleEl = link.querySelector('[class*="title"], [class*="text"]') || link;
        if (titleEl) titleEl.textContent = newTitle;
      });
    });

    if (!syncOfficial) {
      return;
    }

    // 2. 公式サーバー同期（プログレスバー表示）
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

      // 進捗表示
      const currentIdx = i + 1;
      const pct = Math.round((currentIdx / total) * 100);
      if (statusText) statusText.textContent = `処理中: ${currentIdx}/${total}`;
      if (percentText) percentText.textContent = `${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;

      // 公式リネームDOM操作シミュレーション
      await this.simulateOfficialRename(threadId, newTitle);

      // レートリミット対策 400ms ディレイ
      await new Promise(r => setTimeout(r, 400));
    }

    if (statusText) statusText.textContent = `完了: ${total}/${total}`;
    await new Promise(r => setTimeout(r, 500));
    modal.remove();
  }

  async simulateOfficialRename(threadId, newTitle) {
    const threadLink = document.querySelector(`a[href*="${threadId}"]`);
    if (!threadLink) return;

    // 3点リーダーメニューボタンを探す
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
      console.warn(`[Gemini Extended Suite] Official rename simulation skipped for ${threadId}:`, e);
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
