/**
 * Gemini Extended Suite - Feature 8: @SKILL ランチャー (Skill Tree Popover & Auto Scraper)
 * /customize/skills ページからのスキル名自動取得・ローカル保存と、
 * チャット画面でのツリーポップアップ展開＆「@スキル名 + 改行」一括挿入を行うモジュール
 */

class SkillLauncherModule {
  constructor() {
    this.containerId = 'g-ext-skill-launcher-root';
    this.popoverId = 'g-ext-skill-tree-popover';
    this.thinkingContainerId = 'g-ext-thinking-level-root';
    this.enabled = true;

    this.savedSkills = [];
    this.skillsLastUpdated = null;
    this.isPopoverOpen = false;
    this.scrapeDebounceTimer = null;
    this.customizeObserver = null;
    this.hasNotifiedOnCurrentVisit = false;
    this.isAddingManual = false;
    this.boundPositionHandler = null;
  }

  /**
   * XSSおよびDOM構造破損を防ぐためのHTMLエスケープ処理
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 拡張機能コンテキストが有効かどうかを判定し、安全に storage.local を操作するヘルパー
   */
  isContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  }

  async safeStorageGet(keys) {
    if (!this.isContextValid()) return {};
    try {
      return await chrome.storage.local.get(keys);
    } catch (_) {
      return {};
    }
  }

  async safeStorageSet(items) {
    if (!this.isContextValid()) return;
    try {
      await chrome.storage.local.set(items);
    } catch (_) {
      // Extension context invalidated 時は無視
    }
  }

  async init() {
    const data = await this.safeStorageGet(['enableSkillLauncher', 'savedSkills', 'skillsLastUpdated']);
    this.enabled = data.enableSkillLauncher !== false;
    this.savedSkills = Array.isArray(data.savedSkills) ? data.savedSkills : [];
    this.skillsLastUpdated = data.skillsLastUpdated || null;

    if (this.isContextValid()) {
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          if (changes.savedSkills) {
            this.savedSkills = Array.isArray(changes.savedSkills.newValue) ? changes.savedSkills.newValue : [];
            if (this.isPopoverOpen) {
              this.renderPopoverContent();
            }
          }
          if (changes.skillsLastUpdated) {
            this.skillsLastUpdated = changes.skillsLastUpdated.newValue || null;
          }
        });
      } catch (_) {}
    }

    // グローバルな外側クリック＆Escapeキー監視
    document.addEventListener('click', (e) => {
      if (!this.isPopoverOpen) return;
      const btn = document.getElementById(this.containerId);
      const pop = document.getElementById(this.popoverId);
      if (btn && btn.contains(e.target)) return;
      if (pop && pop.contains(e.target)) return;
      this.closePopover();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isPopoverOpen) {
        this.closePopover();
      }
    });

    this.boundPositionHandler = () => {
      if (this.isPopoverOpen) {
        this.updatePopoverPosition();
      }
    };
    window.addEventListener('resize', this.boundPositionHandler);
    window.addEventListener('scroll', this.boundPositionHandler, true);

    window.addEventListener('load', () => {
      this.checkAndMount();
      this.checkAndWatchCustomizePage();
    });

    window.addEventListener('g-ext-url-changed', () => {
      this.closePopover();
      this.hasNotifiedOnCurrentVisit = false;
      setTimeout(() => {
        this.checkAndMount();
        this.checkAndWatchCustomizePage();
      }, 150);
      setTimeout(() => {
        this.checkAndMount();
        this.checkAndWatchCustomizePage();
      }, 600);
    });

    this.checkAndMount();
    this.checkAndWatchCustomizePage();
  }

  /* ==========================================================================
     1. /customize/skills ページでのスキル名自動取得＆ローカル保存
     ========================================================================== */

  isCustomizeSkillsPage() {
    const path = window.location.pathname || '';
    const href = window.location.href || '';
    if (path.startsWith('/customize/skills') || href.includes('/customize/skills')) {
      return true;
    }
    if (path.startsWith('/customize')) {
      if (document.querySelector('customize-card, .skills-grid, [class*="skills-grid"]')) {
        return true;
      }
      const mainEl = document.querySelector('.content-container, main, [role="main"]') || document.body;
      const text = (mainEl?.innerText || '').slice(0, 2000);
      if (text.includes('スキル') || text.includes('Skills') || text.includes('インストール済み')) {
        return true;
      }
    }
    return false;
  }

  checkAndWatchCustomizePage() {
    if (!this.isCustomizeSkillsPage()) {
      this.hasNotifiedOnCurrentVisit = false;
      if (this.customizeObserver) {
        this.customizeObserver.disconnect();
        this.customizeObserver = null;
      }
      return;
    }

    // 初回・遷移時の段階的スクレイピング実行
    this.scheduleScrape(200);
    this.scheduleScrape(800);
    this.scheduleScrape(1800);

    // /customize 滞在中のDOM変化デバウンス監視
    if (!this.customizeObserver && document.body) {
      this.customizeObserver = new MutationObserver((mutations) => {
        const isInternal = mutations.every(m => {
          const el = m.target?.nodeType === Node.ELEMENT_NODE ? m.target : m.target?.parentElement;
          return el && (el.id?.startsWith('g-ext-') || el.closest?.('[id^="g-ext-"], .g-ext-toast, .g-ext-modal'));
        });
        if (isInternal) return;
        this.scheduleScrape(350);
      });

      this.customizeObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  scheduleScrape(delay = 350) {
    clearTimeout(this.scrapeDebounceTimer);
    this.scrapeDebounceTimer = setTimeout(() => {
      if (this.isCustomizeSkillsPage()) {
        this.syncSkillsFromDOM();
      }
    }, delay);
  }

  /**
   * /customize/skills のDOMから登録済み（インストール済み）スキル名を抽出する
   */
  scrapeSkillsFromCustomizePage() {
    const rootArea = document.querySelector('.content-container, main, [role="main"], [class*="customize"]') || document.body;
    if (!rootArea) return [];
    const isOwnExtensionUI = (el) => !el || !!el.closest?.('#g-ext-skill-tree-popover, #g-ext-top-floating-bar, #g-ext-toc-root, .g-ext-modal, .g-ext-toast');

    // 除外する固定UI文言（完全一致・大文字小文字無視）
    const exactNoiseSet = new Set([
      'customize', 'カスタマイズ', 'skills', 'スキル', '見つける', '連携サービス',
      'connected apps', '連携アプリ', '手動で作成', '作成', 'create', 'new skill', '新しいスキル',
      'upload', 'アップロード', 'おすすめ', '推奨', 'recommended', 'featured',
      'インストール済み', 'installed',
      '有効', '無効', 'enabled', 'disabled', 'active', 'inactive',
      '編集', '削除', 'edit', 'delete', 'remove', '複製', 'duplicate', '共有', 'share',
      'gemini', 'google gemini', 'gemini advanced', 'すべて', 'all', 'マイスキル', 'my skills',
      '詳細', 'details', '設定', 'settings', 'キャンセル', 'cancel', '保存', 'save',
      '閉じる', 'close', '検索', 'search', 'ヘルプ', 'help', 'フィードバック', 'feedback',
      'gems', 'gem', 'マネージャー', 'manager', '拡張機能', 'extensions',
      'オン', 'オフ', 'on', 'off', '試す', 'try', '開く', 'open', '追加', 'add',
      'その他のオプション', 'more options'
    ]);

    const noiseRegexes = [
      /^(あなたの|カスタム|登録済み|作成済み|利用可能な|インストール済み)?\s*(スキル|skills?)\s*(一覧|管理|設定|を作成|を追加)?(\s*\(\d+\))?$/i,
      /^インストール済み\s*\(\d+\)$/i,
      /^installed\s*\(\d+\)$/i,
      /スキルを追加または作成して|スキルとは|カスタム\s*スキル|特定のタスク|プロンプトを保存|再利用可能/,
      /まだスキルがありません|スキルを作成して|ここに表示されます/,
      /^\d+\s*(件|個|個のスキル|skills?|items?)$/i,
      /^(最終更新|更新日|作成日|last updated|created|updated)[\s:：]/i,
      /^[0-9\s/:.-]+$/,
      /^(https?:\/\/|www\.)/i
    ];

    const isValidSkillName = (raw) => {
      if (!raw || typeof raw !== 'string') return false;
      const line = raw.split(/\r?\n/)[0].trim().replace(/^@+/, '').trim();
      if (!line) return false;
      if (line.length < 2 || line.length > 60) return false;

      const lower = line.toLowerCase();
      if (exactNoiseSet.has(lower)) return false;

      for (const re of noiseRegexes) {
        if (re.test(line)) return false;
      }

      if ((line.includes('。') || line.includes('、') || line.includes('. ')) && line.length > 25) {
        return false;
      }

      const materialIcons = new Set([
        'more_vert', 'more_horiz', 'add', 'edit', 'delete', 'close', 'check', 'contract',
        'chevron_right', 'expand_more', 'arrow_drop_down', 'arrow_back', 'search', 'settings',
        'bolt', 'auto_awesome', 'spark', 'psychology', 'extension', 'folder', 'info', 'help_outline'
      ]);
      if (materialIcons.has(lower)) return false;

      return true;
    };

    const normalizeSkillName = (raw) => {
      return raw.split(/\r?\n/)[0].trim().replace(/^@+/, '').trim();
    };

    const extracted = [];
    const seen = new Set();

    const addCandidate = (text) => {
      const cleaned = normalizeSkillName(text);
      if (!isValidSkillName(cleaned)) return false;
      const key = cleaned.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        extracted.push(cleaned);
        return true;
      }
      return false;
    };

    const isRecommendedOrUninstalledCard = (card) => {
      const section = card.closest('section.category-section, section, [class*="category-section"]');
      if (section) {
        const headingEl = section.querySelector('.category-title, .category-heading, h2, h3');
        const headingText = (headingEl?.textContent || '').trim();
        if (/^(推奨|おすすめ|recommended|featured|discover|テンプレート|templates?)$/i.test(headingText)) {
          return true;
        }
      }

      const hasAddBtn = !!card.querySelector(
        'gem-icon-button.add-button, .add-button, [fonticonname="add"], [data-mat-icon-name="add"], button[aria-label*="を追加"], button[aria-label^="Add "]'
      );
      const hasMoreBtn = !!card.querySelector(
        'gem-icon-button.more-button, .more-button, [fonticonname="more_horiz"], [fonticonname="more_vert"], button[aria-label*="その他のオプション"], button[aria-label*="More"]'
      );

      if (hasAddBtn && !hasMoreBtn) {
        return true;
      }

      return false;
    };

    const extractFromCard = (card) => {
      const titleTextEl = card.querySelector('.title-text, .title .title-text, [class*="title-text"]');
      if (titleTextEl) {
        const txt = (titleTextEl.textContent || '').trim();
        if (addCandidate(txt)) return true;
      }

      const titleEl = card.querySelector('.content > .title, .title, mat-card-title, [class*="skill-name"], [class*="skill-title"]');
      if (titleEl && !titleEl.closest('.category-heading, header')) {
        const txt = (titleEl.textContent || '').trim();
        if (addCandidate(txt)) return true;
      }

      const primaryBtn = card.querySelector('button.card-primary-action[aria-label], button[data-card-id][aria-label]');
      if (primaryBtn) {
        const aria = (primaryBtn.getAttribute('aria-label') || '').trim();
        if (aria) {
          const firstPart = aria.split(/[,、]/)[0].trim();
          if (addCandidate(firstPart)) return true;
        }
      }

      return false;
    };

    // ステップ1: 「インストール済み」セクションを最優先で走査
    const sections = Array.from(rootArea.querySelectorAll('section.category-section, section, [class*="category-section"]'));
    let foundInstalledSection = false;

    sections.forEach(sec => {
      const headingEl = sec.querySelector('.category-title, .category-heading, h2, h3');
      const headingText = (headingEl?.textContent || '').trim();
      if (/インストール済み|installed|マイスキル|my skills|作成済み|登録済み/i.test(headingText)) {
        foundInstalledSection = true;
        const cards = sec.querySelectorAll('customize-card, [class*="customize-card"], .skills-grid > *');
        cards.forEach(card => {
          if (!isRecommendedOrUninstalledCard(card)) {
            extractFromCard(card);
          }
        });
      }
    });

    if (foundInstalledSection) {
      return extracted;
    }

    // ステップ2: 全 customize-card から未インストール（推奨）カードを除外して抽出
    const allCustomizeCards = Array.from(rootArea.querySelectorAll(
      'customize-card, .skills-grid > *, [data-test-id*="skill-card"], [data-test-id*="skill-item"], mat-card, [class*="skill-card"]'
    )).filter(el => {
      if (isOwnExtensionUI(el) || el.closest('nav, header, aside, [role="navigation"]')) return false;
      return !isRecommendedOrUninstalledCard(el);
    });

    allCustomizeCards.forEach(card => {
      extractFromCard(card);
    });

    // ステップ3: .more-button（その他のオプション）を持つカード要素を逆引き
    if (extracted.length === 0) {
      const moreButtons = rootArea.querySelectorAll(
        'gem-icon-button.more-button, .more-button, button[aria-label*="その他のオプション"]'
      );
      moreButtons.forEach(btn => {
        const card = btn.closest('customize-card, [class*="card"], [role="listitem"]') || btn.parentElement?.parentElement;
        if (card && !isRecommendedOrUninstalledCard(card)) {
          extractFromCard(card);
        }
      });
    }

    return extracted;
  }

  async syncSkillsFromDOM() {
    if (!this.isContextValid()) return;
    const scraped = this.scrapeSkillsFromCustomizePage();
    if (!scraped || scraped.length === 0) return;

    const data = await this.safeStorageGet(['savedSkills']);
    const currentSaved = Array.isArray(data.savedSkills) ? data.savedSkills : [];

    const isSame =
      scraped.length === currentSaved.length &&
      scraped.every((val, idx) => val === currentSaved[idx]);

    if (!isSame) {
      this.savedSkills = scraped;
      this.skillsLastUpdated = new Date().toISOString();
      this.hasNotifiedOnCurrentVisit = true;
      await this.safeStorageSet({
        savedSkills: this.savedSkills,
        skillsLastUpdated: this.skillsLastUpdated
      });
      console.log('[Gemini Extended Suite] ✅ Saved skills from /customize/skills:', this.savedSkills);
      this.showToast(`✅ スキル一覧を更新しました（全 ${this.savedSkills.length} 件）`);
    } else if (!this.hasNotifiedOnCurrentVisit) {
      this.hasNotifiedOnCurrentVisit = true;
      this.savedSkills = scraped;
      console.log('[Gemini Extended Suite] ✅ Skills already up-to-date:', this.savedSkills);
      this.showToast(`✅ スキル一覧を同期済みです（全 ${this.savedSkills.length} 件）`);
    }
  }

  showToast(message, isError = false) {
    let toast = document.getElementById('g-ext-skill-toast');
    if (toast) toast.remove();

    toast = document.createElement('div');
    toast.id = 'g-ext-skill-toast';
    toast.className = `g-ext-toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  /* ==========================================================================
     2. ツールバーボタンのマウント＆ツリーポップアップUI
     ========================================================================== */

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    if (this.isCustomizeSkillsPage()) {
      this.checkAndWatchCustomizePage();
    }

    const anchorInfo = this.findMountAnchor();
    if (!anchorInfo || !anchorInfo.parent) return;

    const existing = document.getElementById(this.containerId);

    if (existing) {
      if (existing.parentElement !== anchorInfo.parent || existing.nextElementSibling !== anchorInfo.beforeElement) {
        anchorInfo.parent.insertBefore(existing, anchorInfo.beforeElement);
      }
      return;
    }

    this.mountUI(anchorInfo.parent, anchorInfo.beforeElement);
  }

  findMountAnchor() {
    const thinkingRoot = document.getElementById(this.thinkingContainerId);
    if (thinkingRoot && thinkingRoot.parentElement) {
      return {
        parent: thinkingRoot.parentElement,
        beforeElement: thinkingRoot
      };
    }

    if (window.thinkingSelectorModule && typeof window.thinkingSelectorModule.findMountAnchor === 'function') {
      const fallbackAnchor = window.thinkingSelectorModule.findMountAnchor();
      if (fallbackAnchor) return fallbackAnchor;
    }

    const modelBtn = this.findModelPickerButton();
    if (!modelBtn) return null;

    let toolbar = modelBtn.closest('[class*="actions"], [class*="toolbar"], [class*="trailing"], [class*="bottom"], [class*="buttons"]');
    if (!toolbar) {
      let curr = modelBtn.parentElement;
      while (curr && curr !== document.body && !curr.matches('.chat-input-container, form, rich-textarea, main')) {
        const hasOtherAction = curr.querySelector(
          'button[aria-label*="マイク"], button[aria-label*="音声"], button[aria-label*="送信"], [class*="send"], [class*="mic"]'
        );
        if (hasOtherAction && hasOtherAction !== modelBtn) {
          toolbar = curr;
          break;
        }
        curr = curr.parentElement;
      }
    }

    if (toolbar) {
      let anchorChild = modelBtn;
      while (anchorChild && anchorChild.parentElement !== toolbar) {
        anchorChild = anchorChild.parentElement;
      }
      if (anchorChild && anchorChild.parentElement === toolbar) {
        return {
          parent: toolbar,
          beforeElement: anchorChild
        };
      }
    }

    if (modelBtn.parentElement && modelBtn.parentElement.parentElement) {
      return {
        parent: modelBtn.parentElement.parentElement,
        beforeElement: modelBtn.parentElement
      };
    }

    return {
      parent: modelBtn.parentElement,
      beforeElement: modelBtn
    };
  }

  findModelPickerButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const keywords = ['Argon', 'Flash', 'Pro', 'Ultra', 'Gemini'];

    for (const btn of buttons) {
      if (btn.id === this.containerId || btn.closest(`#${this.containerId}`) || btn.closest(`#${this.thinkingContainerId}`)) {
        continue;
      }
      const text = (btn.textContent || '').trim();
      const hasModelKeyword = keywords.some(kw => text.includes(kw));
      const hasThinkingKeyword = text.includes('高値') || text.includes('安値') || text.includes('中');
      const hasDropdown = !!btn.querySelector('svg, mat-icon, [class*="arrow"], [class*="expand"]') ||
                          btn.getAttribute('aria-haspopup') === 'menu' ||
                          btn.getAttribute('aria-expanded') !== null;

      if ((hasModelKeyword || hasThinkingKeyword) && (hasDropdown || text.length < 35)) {
        return btn;
      }
    }

    const attrBtn = document.querySelector(
      'button[aria-label*="モデル"], button[aria-label*="Model"], button[data-test-id*="model"], [class*="model-picker-btn"], [class*="model-select"]'
    );
    if (attrBtn && !attrBtn.closest(`#${this.containerId}`) && !attrBtn.closest(`#${this.thinkingContainerId}`)) {
      return attrBtn;
    }

    return null;
  }

  mountUI(parent, beforeElement) {
    const btn = document.createElement('button');
    btn.id = this.containerId;
    btn.type = 'button';
    btn.className = 'g-ext-skill-launcher-btn';
    btn.title = '登録済み @SKILL ツリーメニューを開く';
    btn.innerHTML = `<span class="g-ext-skill-launcher-icon">⚡</span><span>@SKILL</span>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePopover();
    });

    if (beforeElement) {
      parent.insertBefore(btn, beforeElement);
    } else {
      parent.appendChild(btn);
    }

    console.log('[Gemini Extended Suite] @SKILL Tree Launcher mounted in toolbar');
  }

  removeUI() {
    this.closePopover();
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
    const pop = document.getElementById(this.popoverId);
    if (pop) pop.remove();
  }

  togglePopover() {
    if (this.isPopoverOpen) {
      this.closePopover();
    } else {
      this.openPopover();
    }
  }

  async openPopover() {
    if (this.isContextValid()) {
      const data = await this.safeStorageGet(['savedSkills', 'skillsLastUpdated']);
      if (Array.isArray(data.savedSkills)) {
        this.savedSkills = data.savedSkills;
      }
      if (data.skillsLastUpdated) {
        this.skillsLastUpdated = data.skillsLastUpdated;
      }
    }

    let pop = document.getElementById(this.popoverId);
    if (!pop) {
      pop = document.createElement('div');
      pop.id = this.popoverId;
      pop.className = 'g-ext-skill-tree-popover';
      document.body.appendChild(pop);
    }

    this.isPopoverOpen = true;
    this.isAddingManual = false;
    const btn = document.getElementById(this.containerId);
    if (btn) btn.classList.add('active');

    this.renderPopoverContent();
    pop.classList.add('open');
    this.updatePopoverPosition();
  }

  closePopover() {
    this.isPopoverOpen = false;
    this.isAddingManual = false;
    const btn = document.getElementById(this.containerId);
    if (btn) btn.classList.remove('active');

    const pop = document.getElementById(this.popoverId);
    if (pop) {
      pop.classList.remove('open');
    }
  }

  updatePopoverPosition() {
    const btn = document.getElementById(this.containerId);
    const pop = document.getElementById(this.popoverId);
    if (!btn || !pop || !this.isPopoverOpen) return;

    const rect = btn.getBoundingClientRect();
    const popWidth = pop.offsetWidth || 280;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const bottomOffset = Math.max(12, viewportHeight - rect.top + 8);
    let leftOffset = rect.left;
    if (leftOffset + popWidth > viewportWidth - 12) {
      leftOffset = Math.max(12, viewportWidth - popWidth - 12);
    }

    pop.style.bottom = `${bottomOffset}px`;
    pop.style.left = `${leftOffset}px`;
  }

  buildSkillTreeData(skills) {
    const prefixBuckets = new Map();
    const ungrouped = [];

    skills.forEach(skill => {
      const match = skill.match(/^([^:\-_/]+)[:\-_/](.+)$/);
      if (match && match[1].trim().length >= 2) {
        const prefix = match[1].trim();
        if (!prefixBuckets.has(prefix)) {
          prefixBuckets.set(prefix, []);
        }
        prefixBuckets.get(prefix).push(skill);
      } else {
        ungrouped.push(skill);
      }
    });

    const groups = [];
    const leftovers = [];

    for (const [prefix, items] of prefixBuckets.entries()) {
      const hasExplicitCategory = items.some(s => s.includes(':') || s.includes('/'));
      if (items.length >= 2 || hasExplicitCategory) {
        groups.push({
          name: prefix,
          items
        });
      } else {
        leftovers.push(...items);
      }
    }

    const flatItems = [...leftovers, ...ungrouped];
    return { groups, flatItems };
  }

  renderPopoverContent() {
    const pop = document.getElementById(this.popoverId);
    if (!pop) return;

    const count = this.savedSkills.length;
    const treeData = this.buildSkillTreeData(this.savedSkills);

    let bodyHtml = '';

    if (count === 0) {
      bodyHtml = `
        <div class="g-ext-skill-empty">
          <div class="g-ext-skill-empty-text">
            スキルが未取得です。下のボタンからスキルページを開くと自動取得されます。
          </div>
          <button type="button" class="g-ext-btn g-ext-btn-primary g-ext-skill-open-page-btn" id="g-ext-skill-empty-open-btn">
            🚀 スキルページを開く (/customize/skills)
          </button>
        </div>
      `;
    } else {
      let treeNodesHtml = '';

      if (treeData.groups.length > 0) {
        treeData.groups.forEach(group => {
          const safeGroupName = this.escapeHtml(group.name);
          const itemsHtml = group.items.map(skill => this.renderSkillLeafHtml(skill)).join('');
          treeNodesHtml += `
            <details class="g-ext-skill-tree-group" open>
              <summary class="g-ext-skill-tree-summary">
                <span class="g-ext-skill-tree-arrow">▸</span>
                <span class="g-ext-skill-tree-folder-icon">📂</span>
                <span class="g-ext-skill-tree-group-name">${safeGroupName}</span>
                <span class="g-ext-skill-tree-badge">${group.items.length}</span>
              </summary>
              <div class="g-ext-skill-tree-children">
                ${itemsHtml}
              </div>
            </details>
          `;
        });

        if (treeData.flatItems.length > 0) {
          const flatHtml = treeData.flatItems.map(skill => this.renderSkillLeafHtml(skill)).join('');
          treeNodesHtml += `
            <details class="g-ext-skill-tree-group" open>
              <summary class="g-ext-skill-tree-summary">
                <span class="g-ext-skill-tree-arrow">▸</span>
                <span class="g-ext-skill-tree-folder-icon">📁</span>
                <span class="g-ext-skill-tree-group-name">その他・一般スキル</span>
                <span class="g-ext-skill-tree-badge">${treeData.flatItems.length}</span>
              </summary>
              <div class="g-ext-skill-tree-children">
                ${flatHtml}
              </div>
            </details>
          `;
        }
      } else {
        const allItemsHtml = this.savedSkills.map(skill => this.renderSkillLeafHtml(skill)).join('');
        treeNodesHtml = `
          <details class="g-ext-skill-tree-group" open>
            <summary class="g-ext-skill-tree-summary">
              <span class="g-ext-skill-tree-arrow">▸</span>
              <span class="g-ext-skill-tree-folder-icon">📁</span>
              <span class="g-ext-skill-tree-group-name">登録スキル一覧</span>
              <span class="g-ext-skill-tree-badge">${count}</span>
            </summary>
            <div class="g-ext-skill-tree-children">
              ${allItemsHtml}
            </div>
          </details>
        `;
      }

      bodyHtml = `<div class="g-ext-skill-tree-body">${treeNodesHtml}</div>`;
    }

    const manualFormHtml = this.isAddingManual ? `
      <div class="g-ext-skill-manual-form">
        <input type="text" id="g-ext-skill-manual-input" class="g-ext-input g-ext-skill-manual-input" placeholder="スキル名を入力 (例: novel-humanizer)">
        <button type="button" class="g-ext-btn g-ext-btn-primary g-ext-skill-manual-save" id="g-ext-skill-manual-save-btn">追加</button>
      </div>
    ` : '';

    pop.innerHTML = `
      <div class="g-ext-skill-popover-header">
        <div class="g-ext-skill-popover-title">
          <span>⚡ @SKILL ランチャー</span>
          <span class="g-ext-skill-popover-count">${count}件</span>
        </div>
        <button type="button" class="g-ext-skill-popover-close" id="g-ext-skill-popover-close-btn" title="閉じる">✕</button>
      </div>

      ${bodyHtml}

      ${manualFormHtml}

      <div class="g-ext-skill-popover-footer">
        <button type="button" class="g-ext-btn-tiny" id="g-ext-skill-add-manual-btn" title="スキル名を手動で登録">
          ＋ 手動追加
        </button>
        <a href="https://gemini.google.com/customize/skills" target="_blank" rel="noopener noreferrer" class="g-ext-skill-manage-link" id="g-ext-skill-open-manage-link" title="Gemini公式のスキル管理ページを開いて自動同期">
          🔄 スキル管理ページを開く ↗
        </a>
      </div>
    `;

    this.bindPopoverEvents(pop);
    this.updatePopoverPosition();
  }

  renderSkillLeafHtml(skillName) {
    const safeName = this.escapeHtml(skillName);
    return `
      <div class="g-ext-skill-tree-item" data-skill="${safeName}" title="クリックして @${safeName} を挿入">
        <span class="g-ext-skill-item-prefix">@</span>
        <span class="g-ext-skill-item-name">${safeName}</span>
        <button type="button" class="g-ext-skill-item-delete" data-delete-skill="${safeName}" title="一覧から削除">✕</button>
      </div>
    `;
  }

  bindPopoverEvents(pop) {
    pop.querySelector('#g-ext-skill-popover-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePopover();
    });

    pop.querySelector('#g-ext-skill-empty-open-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open('https://gemini.google.com/customize/skills', '_blank');
      this.closePopover();
    });

    pop.querySelectorAll('.g-ext-skill-tree-item').forEach(itemEl => {
      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('.g-ext-skill-item-delete')) return;
        e.preventDefault();
        e.stopPropagation();
        const skillName = itemEl.getAttribute('data-skill');
        if (skillName) {
          this.closePopover();
          this.insertSkillIntoEditor(skillName);
        }
      });
    });

    pop.querySelectorAll('.g-ext-skill-item-delete').forEach(delBtn => {
      delBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetSkill = delBtn.getAttribute('data-delete-skill');
        if (!targetSkill) return;
        this.savedSkills = this.savedSkills.filter(s => s !== targetSkill);
        await this.safeStorageSet({
          savedSkills: this.savedSkills,
          skillsLastUpdated: new Date().toISOString()
        });
        this.renderPopoverContent();
      });
    });

    pop.querySelector('#g-ext-skill-add-manual-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isAddingManual = !this.isAddingManual;
      this.renderPopoverContent();
      if (this.isAddingManual) {
        const input = pop.querySelector('#g-ext-skill-manual-input');
        if (input) input.focus();
      }
    });

    const manualInput = pop.querySelector('#g-ext-skill-manual-input');
    const saveManualSkill = async () => {
      if (!manualInput) return;
      const raw = manualInput.value.trim().replace(/^@+/, '').trim();
      if (!raw) return;
      if (!this.savedSkills.includes(raw)) {
        this.savedSkills.push(raw);
        await this.safeStorageSet({
          savedSkills: this.savedSkills,
          skillsLastUpdated: new Date().toISOString()
        });
      }
      this.isAddingManual = false;
      this.renderPopoverContent();
    };

    pop.querySelector('#g-ext-skill-manual-save-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveManualSkill();
    });

    manualInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        saveManualSkill();
      }
    });
  }

  /* ==========================================================================
     3. クリックで `@スキル名` ＋ 改行 を入力欄へ挿入
     ========================================================================== */

  /**
   * Geminiのチャット入力欄要素を特定する
   */
  findChatEditor() {
    const primaryEditor = document.querySelector(
      'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"]'
    );
    if (primaryEditor) return primaryEditor;

    const fallbackSelectors = [
      'rich-textarea [contenteditable]',
      'rich-textarea .ql-editor',
      '.ql-editor',
      '[role="textbox"][contenteditable]',
      '.chat-input-container [contenteditable]',
      'rich-textarea textarea',
      'textarea[aria-label*="プロンプト"]',
      'textarea[aria-label*="Prompt"]'
    ];

    for (const sel of fallbackSelectors) {
      const el = document.querySelector(sel);
      if (el && !el.closest('#g-ext-skill-tree-popover, .g-ext-modal')) {
        return el;
      }
    }

    return null;
  }

  insertSkillIntoEditor(skillName) {
    const editor = this.findChatEditor();

    if (!editor) {
      console.log('[Gemini Extended Suite] Chat input editor not found');
      this.showToast('⚠️ チャット入力欄が見つかりませんでした', true);
      return;
    }

    const cleanSkillName = skillName.replace(/^@+/, '').trim();
    const textWithNewline = `@${cleanSkillName}\n`;

    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      editor.focus();
      const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : editor.value.length;
      const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : editor.value.length;
      editor.value = editor.value.slice(0, start) + textWithNewline + editor.value.slice(end);
      const nextPos = start + textWithNewline.length;
      editor.setSelectionRange(nextPos, nextPos);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: textWithNewline, inputType: 'insertText' }));
      return;
    }

    // 1. エディタにフォーカスを当てる
    editor.focus();

    // 2. 現在のカーソル位置がエディタ内に無ければ末尾へ移動
    const sel = window.getSelection();
    if (sel) {
      const hasRangeInEditor = sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (!hasRangeInEditor) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // 挿入前の行数を記録（改行が実際に反映されたか検証するため）
    const getEditorLineCount = () => {
      const txt = (editor.innerText || '').replace(/\n$/, '');
      const brCount = editor.querySelectorAll('br, p, div').length;
      return { textLines: txt.split('\n').length, brCount, rawInner: editor.innerText || '' };
    };
    const beforeState = getEditorLineCount();

    // 3. beforeinput イベントを発火
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: textWithNewline
    }));

    // 4. execCommand('insertText', false, `@${skillName}\n`) を実行
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, textWithNewline);
    } catch (_) {
      inserted = false;
    }

    const afterInsertState = getEditorLineCount();

    if (!inserted) {
      // execCommand自体が効かない環境向け：Range操作で `@スキル名` と改行(<br>)を挿入して次行へカーソル移動
      this._fallbackRangeInsertWithNewline(editor, `@${cleanSkillName}`);
    } else {
      // execCommandは成功したが、`\n` が単一改行として処理されなかった場合のフォールバック
      const newlineCreated =
        afterInsertState.rawInner.endsWith('\n') ||
        afterInsertState.textLines > beforeState.textLines ||
        afterInsertState.brCount > beforeState.brCount;

      if (!newlineCreated) {
        let lbInserted = false;
        try {
          lbInserted = document.execCommand('insertLineBreak') || document.execCommand('insertParagraph');
        } catch (_) {
          lbInserted = false;
        }
        if (!lbInserted) {
          this._insertLineBreakAtCaret(editor);
        }
      }
    }

    // 5. 挿入後に input イベントを発火させ、Gemini側の内部ステートに確実に反映させる
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertText',
      data: textWithNewline
    }));
  }

  /**
   * Range操作でテキストと改行ブロックを挿入し、カーソルを次行へ移動させるフォールバック
   */
  _fallbackRangeInsertWithNewline(editor, mentionText) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const textNode = document.createTextNode(mentionText);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    sel.removeAllRanges();
    sel.addRange(range);

    this._insertLineBreakAtCaret(editor);
  }

  /**
   * 現在のキャレット位置に <br>（および末尾用の空テキストまたは補助 <br>）を挿入して次行へキャレットを移動
   */
  _insertLineBreakAtCaret(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const br = document.createElement('br');
    range.insertNode(br);

    const trailingNode = document.createTextNode('');
    if (br.nextSibling) {
      br.parentNode.insertBefore(trailingNode, br.nextSibling);
    } else {
      const extraBr = document.createElement('br');
      br.parentNode.appendChild(extraBr);
      br.parentNode.insertBefore(trailingNode, extraBr);
    }

    const newRange = document.createRange();
    newRange.setStart(trailingNode, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    editor.focus();
  }
}

// 登録
window.skillLauncherModule = new SkillLauncherModule();
window.skillLauncherModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('skillLauncher', window.skillLauncherModule);
  }
});
