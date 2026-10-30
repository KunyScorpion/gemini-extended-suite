/**
 * Gemini Extended Suite - Feature 4: チャット全文Markdownエクスポート
 * メインチャット画面（/app）での確実な常時表示（右上ツールバーまたはフローティング）
 */

class ExporterMdModule {
  constructor() {
    this.containerId = 'g-ext-export-btn-root';
    this.enabled = true;
    this.includeThinking = true;
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

  async init() {
    const data = await chrome.storage.local.get(['enableMarkdownExport', 'exportIncludeThinking']);
    this.enabled = data.enableMarkdownExport !== false;
    this.includeThinking = data.exportIncludeThinking !== false;
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
    }

    const existing = document.getElementById(this.containerId);
    if (existing) return;

    // 1. 公式ヘッダーまたはトップバーを探索
    const targetAnchor = this.findHeaderAnchor();
    if (targetAnchor) {
      this.mountUI(targetAnchor);
      return;
    }

    // 2. チャット画面（/app/*）のフォールバック: 右上フローティング・コントロールコンテナ
    this.mountFloatingFallback();
  }

  findHeaderAnchor() {
    const selectors = [
      'header [class*="trailing-actions"]',
      'header [class*="actions"]',
      'header [class*="tools"]',
      'header',
      '[role="banner"] [class*="actions"]',
      '[role="banner"]',
      'app-header',
      'mat-toolbar',
      '.top-bar-container',
      '.chat-header',
      '[data-test-id*="header"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetHeight > 0) return el;
    }
    return null;
  }

  mountUI(anchor) {
    const btn = this.createExportButton();
    anchor.appendChild(btn);
    console.log('[Gemini Extended Suite] Markdown Exporter mounted in header');
  }

  mountFloatingFallback() {
    // 右上のフローティングユーティリティバーを取得または作成
    let utilBar = document.getElementById('g-ext-top-floating-bar');
    if (!utilBar) {
      utilBar = document.createElement('div');
      utilBar.id = 'g-ext-top-floating-bar';
      utilBar.className = 'g-ext-top-floating-bar';
      document.body.appendChild(utilBar);
    }

    const btn = this.createExportButton();
    utilBar.appendChild(btn);
    console.log('[Gemini Extended Suite] Markdown Exporter mounted in floating bar');
  }

  createExportButton() {
    const btn = document.createElement('button');
    btn.id = this.containerId;
    btn.type = 'button';
    btn.className = 'g-ext-export-btn';
    btn.innerHTML = `<span>📥</span><span>MD保存</span>`;
    btn.title = '現在のチャットをMarkdownファイルとしてエクスポート';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openExportModal();
    });

    return btn;
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  openExportModal() {
    const defaultTitle = this.getConversationTitle();
    const safeDefaultTitle = this.escapeHtml(defaultTitle);

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'g-ext-modal-backdrop';

    modalBackdrop.innerHTML = `
      <div class="g-ext-modal">
        <div class="g-ext-modal-header">
          <span class="g-ext-modal-title">📥 チャットをMarkdownエクスポート</span>
          <button type="button" class="g-ext-modal-close">✕</button>
        </div>

        <div style="font-size:13px;color:var(--g-ext-text);">
          スレッド内の全ユーザー発言、Geminiの回答、思考プロセス、コードブロック、表を整形してMarkdown出力します。
        </div>

        <div class="g-ext-modal-field">
          <label class="g-ext-modal-label">スレッド名 / 保存ファイル名</label>
          <input type="text" id="g-ext-export-filename-input" class="g-ext-input" value="${safeDefaultTitle}" placeholder="スレッド名またはファイル名を入力">
          <span style="font-size:11px;color:var(--g-ext-text-muted);margin-top:2px;">※保存時は「YYYYMMDD_スレッド名.md」として出力されます。</span>
        </div>

        <div class="g-ext-modal-field">
          <label class="g-ext-checkbox-item">
            <input type="checkbox" id="g-ext-export-thinking-cb" ${this.includeThinking ? 'checked' : ''}>
            <span>思考プロセス（Thinking / Extended Reasoning）を含める</span>
          </label>
        </div>

        <div class="g-ext-modal-actions">
          <button type="button" class="g-ext-btn g-ext-btn-secondary" id="g-ext-modal-export-cancel">キャンセル</button>
          <button type="button" class="g-ext-btn g-ext-btn-primary" id="g-ext-modal-export-run">エクスポート実行</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    const close = () => modalBackdrop.remove();
    modalBackdrop.querySelector('.g-ext-modal-close').addEventListener('click', close);
    modalBackdrop.querySelector('#g-ext-modal-export-cancel').addEventListener('click', close);

    const filenameInput = modalBackdrop.querySelector('#g-ext-export-filename-input');
    filenameInput.focus();
    filenameInput.select();

    modalBackdrop.querySelector('#g-ext-modal-export-run').addEventListener('click', async () => {
      this.includeThinking = modalBackdrop.querySelector('#g-ext-export-thinking-cb').checked;
      await chrome.storage.local.set({ exportIncludeThinking: this.includeThinking });
      const customTitle = filenameInput.value.trim() || defaultTitle;
      this.executeExport(customTitle);
      close();
    });
  }

  /**
   * 現在のスレッド名をDOM、URL、サイドバーキャッシュ等から多段階で自動取得
   */
  getConversationTitle() {
    const threadIdMatch = window.location.href.match(/\/app\/([a-zA-Z0-9_-]+)/);
    const threadId = threadIdMatch ? threadIdMatch[1] : null;

    // 1. サイドバーのアクティブ／カレントなスレッド要素から取得
    if (threadId) {
      const activeLink = document.querySelector(`a[href*="/app/${threadId}"]`);
      if (activeLink) {
        const titleEl = activeLink.querySelector('[class*="title"], [class*="text"], span') || activeLink;
        const txt = (titleEl.textContent || titleEl.getAttribute('title') || '').trim();
        if (txt && !txt.startsWith('スレッド (') && txt !== 'Gemini') {
          return txt;
        }
      }
    }

    const currentSidebarItem = document.querySelector(
      '[data-test-id="conversation"][class*="selected"], [aria-current="page"], side-nav-entry[class*="active"], side-nav-entry.selected, .conversation.selected'
    );
    if (currentSidebarItem) {
      const titleEl = currentSidebarItem.querySelector('[class*="title"], [class*="text"], span') || currentSidebarItem;
      const txt = (titleEl.textContent || currentSidebarItem.getAttribute('title') || '').trim();
      if (txt && !txt.startsWith('スレッド (') && txt !== 'Gemini') {
        return txt;
      }
    }

    // 2. サイドバーフォルダモジュールのキャッシュまたはストレージ
    if (threadId && window.sidebarFoldersModule) {
      if (typeof window.sidebarFoldersModule.findThreadTitle === 'function') {
        const found = window.sidebarFoldersModule.findThreadTitle(threadId);
        if (found && !found.startsWith('スレッド (')) {
          return found;
        }
      }
      if (window.sidebarFoldersModule.threadTitles?.[threadId]) {
        const cached = window.sidebarFoldersModule.threadTitles[threadId];
        if (cached && !cached.startsWith('スレッド (')) {
          return cached;
        }
      }
    }

    // 3. メインエリアやヘッダーの会話タイトル要素
    const headerTitle = document.querySelector(
      'header [class*="title"], .conversation-title, [data-test-id*="conversation-title"], h1[class*="title"]'
    );
    if (headerTitle) {
      const txt = (headerTitle.textContent || '').trim();
      if (txt && txt !== 'Gemini' && txt !== 'Google Gemini') {
        return txt;
      }
    }

    // 4. document.title から有意なスレッド名を抽出
    const docTitle = document.title
      .replace(/\s*-\s*Gemini.*$/i, '')
      .replace(/^Gemini\s*[-–—:]\s*/i, '')
      .trim();
    if (docTitle && docTitle.toLowerCase() !== 'gemini' && docTitle !== 'Google Gemini') {
      return docTitle;
    }

    // 5. チャット内の第1ターン（ユーザー発言）からタイトルを生成
    try {
      const turns = this.extractMessageTurns();
      const firstUserTurn = turns.find(t => t.role === 'user');
      if (firstUserTurn && firstUserTurn.content) {
        const firstLine = firstUserTurn.content.split('\n')[0].replace(/^[#>\s\-*`]+/g, '').trim();
        if (firstLine) {
          return firstLine.slice(0, 35);
        }
      }
    } catch (_) {}

    // 6. フォールバック
    return threadId ? `Gemini_Chat_${threadId.slice(-6)}` : 'Gemini_Chat';
  }

  executeExport(specifiedTitle = null) {
    const conversationTitle = specifiedTitle || this.getConversationTitle();
    const currentUrl = window.location.href;
    const now = new Date();
    const dateStr = now.toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');

    const messageTurns = this.extractMessageTurns();

    let md = `---
title: "${conversationTitle.replace(/"/g, '\\"')}"
date: "${dateStr}"
source_url: "${currentUrl}"
total_turns: ${messageTurns.length}
generator: "Gemini Extended Suite"
---

# ${conversationTitle}

`;

    messageTurns.forEach((turn, idx) => {
      if (turn.role === 'user') {
        md += `## 👤 ユーザー (Turn ${idx + 1})\n\n${turn.content}\n\n---\n\n`;
      } else {
        md += `## 🤖 Gemini (Turn ${idx + 1})\n\n`;
        if (turn.thinking && this.includeThinking) {
          md += `> [!NOTE]\n> **思考プロセス (Reasoning Process)**:\n>\n`;
          const thinkingLines = turn.thinking.split('\n').map(l => `> ${l}`).join('\n');
          md += `${thinkingLines}\n\n`;
        }
        md += `${turn.content}\n\n---\n\n`;
      }
    });

    // ファイル名サニタイズ（禁止文字除去、長さ制限、余分な拡張子の調整）
    let sanitizedTitle = conversationTitle
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .replace(/^\.+|\.+$/g, '')
      .replace(/\.md$/i, '')
      .trim()
      .slice(0, 60);

    if (!sanitizedTitle) sanitizedTitle = 'Gemini_Chat';

    const filename = `${datePrefix}_${sanitizedTitle}.md`;

    this.downloadFile(filename, md);
  }

  extractMessageTurns() {
    const turns = [];
    const messageContainers = document.querySelectorAll(
      'message-content, .message-content, [data-test-id*="message"], .conversation-turn, [class*="response-container"], [class*="user-query-container"]'
    );

    if (messageContainers.length > 0) {
      messageContainers.forEach(container => {
        const isUser = !!container.closest('[class*="user"], [data-role="user"]') ||
                       !!container.querySelector('[class*="user-query"], .user-query');

        const thinkingEl = container.querySelector('[class*="thinking"], [class*="reasoning"], details');
        const thinkingText = thinkingEl ? thinkingEl.innerText.trim() : null;

        const clone = container.cloneNode(true);
        if (thinkingEl) {
          clone.querySelectorAll('[class*="thinking"], [class*="reasoning"], details').forEach(e => e.remove());
        }

        const mdContent = this.convertElementToMarkdown(clone);

        if (mdContent.trim()) {
          turns.push({
            role: isUser ? 'user' : 'model',
            content: mdContent.trim(),
            thinking: thinkingText
          });
        }
      });
    }

    if (turns.length === 0) {
      const text = document.body.innerText;
      turns.push({
        role: 'model',
        content: text.slice(0, 5000),
        thinking: null
      });
    }

    return turns;
  }

  convertElementToMarkdown(element) {
    if (!element) return '';

    // 1. コードブロック (<pre>) の事前処理
    element.querySelectorAll('pre').forEach(pre => {
      const code = pre.querySelector('code');
      const lang = code?.className?.replace(/.*language-([a-zA-Z0-9_-]+).*/, '$1') || pre.getAttribute('data-language') || '';
      const cleanLang = lang === code?.className ? '' : lang;
      const text = code ? code.innerText : pre.innerText;
      pre.setAttribute('data-md-code', `\n\`\`\`${cleanLang}\n${text.replace(/\n$/, '')}\n\`\`\`\n`);
    });

    // 2. 数式要素（KaTeX / MathJax / Gemini標準数式）の事前処理
    const mathCandidates = element.querySelectorAll(
      '[data-math], [data-tex], [data-latex], .math-block, .math-inline, .katex-display, span.katex, math'
    );
    mathCandidates.forEach(mathEl => {
      if (mathEl.parentElement?.closest('[data-md-math], [data-md-code]')) return;

      let tex = mathEl.getAttribute('data-math') ||
                mathEl.getAttribute('data-tex') ||
                mathEl.getAttribute('data-latex') || '';

      if (!tex) {
        const annotation = mathEl.querySelector('annotation[encoding="application/x-tex"], annotation');
        if (annotation) {
          tex = annotation.textContent || '';
        }
      }

      if (!tex && mathEl.tagName.toLowerCase() === 'math') {
        const altText = mathEl.getAttribute('alttext');
        if (altText) tex = altText;
      }

      if (!tex) {
        const cloneMath = mathEl.cloneNode(true);
        cloneMath.querySelectorAll('.katex-html, [aria-hidden="true"]').forEach(el => el.remove());
        tex = (cloneMath.textContent || mathEl.textContent || '').trim();
      }

      tex = tex.trim();
      if (!tex) return;

      const isBlock = mathEl.classList.contains('math-block') ||
                      mathEl.classList.contains('katex-display') ||
                      mathEl.tagName.toLowerCase() === 'div' ||
                      mathEl.getAttribute('display') === 'block';

      if (isBlock) {
        mathEl.setAttribute('data-md-math', `\n$$\n${tex}\n$$\n`);
      } else {
        mathEl.setAttribute('data-md-math', `$${tex}$`);
      }
    });

    // 3. テーブル (<table>) の事前処理（セル内改行を <br> 化＆タグエスケープ）
    element.querySelectorAll('table').forEach(table => {
      if (table.closest('[data-md-code]')) return;
      let tableMd = '\n';
      const rows = Array.from(table.querySelectorAll('tr'));
      rows.forEach((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('th, td')).map(c => {
          let text = (c.innerText || '').trim();
          text = text.replace(/\|/g, '\\|');
          text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          text = text.replace(/\r?\n/g, '<br>');
          return text;
        });

        if (cells.length === 0) return;
        tableMd += `| ${cells.join(' | ')} |\n`;
        if (rIdx === 0) {
          tableMd += `| ${cells.map(() => '---').join(' | ')} |\n`;
        }
      });
      table.setAttribute('data-md-table', `${tableMd}\n`);
    });

    // 4. DOMツリー走査関数
    const walkChildren = (parent, listDepth = 0) => {
      let out = '';
      for (const child of parent.childNodes) {
        out += walk(child, listDepth);
      }
      return out;
    };

    const walk = (node, listDepth = 0) => {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent;
        // 地の文でHTMLタグと誤解釈され以降が消滅するのを防止
        return text
          .replace(/<script\b/gi, '&lt;script')
          .replace(/<\/script>/gi, '&lt;/script&gt;')
          .replace(/<style\b/gi, '&lt;style')
          .replace(/<iframe\b/gi, '&lt;iframe');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      if (node.hasAttribute('data-md-code')) {
        return node.getAttribute('data-md-code');
      }
      if (node.hasAttribute('data-md-math')) {
        return node.getAttribute('data-md-math');
      }
      if (node.hasAttribute('data-md-table')) {
        return node.getAttribute('data-md-table');
      }

      const tag = node.tagName.toLowerCase();

      if (tag === 'h1') return `\n# ${walkChildren(node, listDepth).trim()}\n`;
      if (tag === 'h2') return `\n## ${walkChildren(node, listDepth).trim()}\n`;
      if (tag === 'h3') return `\n### ${walkChildren(node, listDepth).trim()}\n`;
      if (tag === 'h4') return `\n#### ${walkChildren(node, listDepth).trim()}\n`;
      if (tag === 'h5') return `\n##### ${walkChildren(node, listDepth).trim()}\n`;
      if (tag === 'h6') return `\n###### ${walkChildren(node, listDepth).trim()}\n`;

      if (tag === 'hr') return '\n\n---\n\n';
      if (tag === 'br') return '\n';

      if (tag === 'strong' || tag === 'b') {
        return `**${walkChildren(node, listDepth)}**`;
      }
      if (tag === 'em' || tag === 'i') {
        return `*${walkChildren(node, listDepth)}*`;
      }
      if (tag === 'del' || tag === 's') {
        return `~~${walkChildren(node, listDepth)}~~`;
      }

      // インラインコード
      if (tag === 'code') {
        if (node.closest('pre, [data-md-code]')) {
          return node.textContent;
        }
        return `\`${node.textContent}\``;
      }

      // ハイパーリンク
      if (tag === 'a') {
        const linkText = walkChildren(node, listDepth).trim() || (node.textContent || '').trim();
        const rawHref = (node.getAttribute('href') || '').trim();
        if (!rawHref || /^javascript:/i.test(rawHref)) {
          return linkText;
        }
        return `[${linkText}](${rawHref})`;
      }

      // 引用ブロック
      if (tag === 'blockquote') {
        const inner = walkChildren(node, listDepth).trim();
        if (!inner) return '';
        const quotedLines = inner
          .split('\n')
          .map(line => (line.trim() ? `> ${line}` : '>'))
          .join('\n');
        return `\n\n${quotedLines}\n\n`;
      }

      // リストとネスト対応
      if (tag === 'ul' || tag === 'ol') {
        const isOrdered = tag === 'ol';
        const startAttr = parseInt(node.getAttribute('start') || '1', 10);
        let itemIndex = isNaN(startAttr) ? 1 : startAttr;
        let listOut = listDepth === 0 ? '\n' : '';

        for (const child of node.children) {
          const childTag = child.tagName.toLowerCase();
          if (childTag === 'li') {
            const indent = '  '.repeat(listDepth);
            const prefix = isOrdered ? `${itemIndex}. ` : '- ';
            itemIndex++;

            let inlineParts = '';
            let nestedLists = '';

            for (const liChild of child.childNodes) {
              if (liChild.nodeType === Node.ELEMENT_NODE) {
                const liChildTag = liChild.tagName.toLowerCase();
                if (liChildTag === 'ul' || liChildTag === 'ol') {
                  nestedLists += walk(liChild, listDepth + 1);
                  continue;
                }
              }
              inlineParts += walk(liChild, listDepth + 1);
            }

            const cleanInline = inlineParts.trim().replace(/\n+/g, ' ');
            listOut += `\n${indent}${prefix}${cleanInline}${nestedLists}`;
          } else if (childTag === 'ul' || childTag === 'ol') {
            listOut += walk(child, listDepth + 1);
          }
        }

        return listDepth === 0 ? `${listOut}\n` : listOut;
      }

      if (tag === 'li') {
        const indent = '  '.repeat(listDepth);
        return `\n${indent}- ${walkChildren(node, listDepth + 1).trim()}`;
      }

      if (tag === 'p') {
        return `\n\n${walkChildren(node, listDepth)}\n`;
      }

      return walkChildren(node, listDepth);
    };

    const result = walk(element, 0);
    return result.replace(/\n{3,}/g, '\n\n');
  }

  downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[Gemini Extended Suite] Exported markdown: ${filename}`);
  }
}

// 登録
window.exporterMdModule = new ExporterMdModule();
window.exporterMdModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('exporterMd', window.exporterMdModule);
  }
});
