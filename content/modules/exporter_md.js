/**
 * Gemini Extended Suite - Feature 4: チャット全文Markdownエクスポート
 * フロントマター、Thinkingブロック含有/除外切り替え、コード言語・表・リスト高精度Markdown変換
 */

class ExporterMdModule {
  constructor() {
    this.containerId = 'g-ext-export-btn-root';
    this.enabled = true;
    this.includeThinking = true;
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

    // ヘッダーまたはスレッド上部のアクション領域
    const targetAnchor = this.findHeaderAnchor();
    if (!targetAnchor) return;

    this.mountUI(targetAnchor);
  }

  findHeaderAnchor() {
    const selectors = [
      'header [class*="trailing-actions"]',
      'header [class*="actions"]',
      'header',
      '.top-bar-container',
      '[data-test-id*="header"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  mountUI(anchor) {
    const btn = document.createElement('button');
    btn.id = this.containerId;
    btn.type = 'button';
    btn.className = 'g-ext-export-btn';
    btn.innerHTML = `<span>📥</span><span>MD保存</span>`;
    btn.title = '現在のチャットをMarkdownファイルとしてエクスポート';

    btn.addEventListener('click', () => {
      this.openExportModal();
    });

    anchor.appendChild(btn);
    console.log('[Gemini Extended Suite] Markdown Exporter mounted');
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  openExportModal() {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'g-ext-modal-backdrop';

    modalBackdrop.innerHTML = `
      <div class="g-ext-modal">
        <div class="g-ext-modal-header">
          <span class="g-ext-modal-title">📥 チャットをMarkdownエクスポート</span>
          <button type="button" class="g-ext-modal-close">✕</button>
        </div>

        <div style="font-size:13px;color:var(--g-ext-text);">
          スレッド内の全ユーザー発言、AI回答、コードブロック、テーブルを構造化Markdownに変換してダウンロードします。
        </div>

        <div class="g-ext-modal-field">
          <label class="g-ext-checkbox-item">
            <input type="checkbox" id="g-ext-export-thinking-cb" ${this.includeThinking ? 'checked' : ''}>
            <span>思考プロセス（Thinking / Reasoningブロック）を含める</span>
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

    modalBackdrop.querySelector('#g-ext-modal-export-run').addEventListener('click', async () => {
      this.includeThinking = modalBackdrop.querySelector('#g-ext-export-thinking-cb').checked;
      await chrome.storage.local.set({ exportIncludeThinking: this.includeThinking });
      this.executeExport();
      close();
    });
  }

  executeExport() {
    const conversationTitle = document.title.replace(' - Gemini', '').trim() || 'Gemini_Chat';
    const currentUrl = window.location.href;
    const now = new Date();
    const dateStr = now.toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');

    // スレッド内のメッセージターンを走査
    const messageTurns = this.extractMessageTurns();

    // フロントマター生成
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

    // ファイル名サニタイズ (YYYYMMDD_[タイトル].md)
    const sanitizedTitle = conversationTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
    const filename = `${datePrefix}_${sanitizedTitle}.md`;

    this.downloadFile(filename, md);
  }

  extractMessageTurns() {
    const turns = [];

    // メッセージコンテナのセレクタ候補
    const messageContainers = document.querySelectorAll(
      'message-content, .message-content, [data-test-id*="message"], .conversation-turn'
    );

    if (messageContainers.length > 0) {
      messageContainers.forEach(container => {
        const isUser = !!container.closest('[class*="user"], [data-role="user"]') ||
                       !!container.querySelector('[class*="user-query"], .user-query');

        const thinkingEl = container.querySelector('[class*="thinking"], [class*="reasoning"], details');
        const thinkingText = thinkingEl ? thinkingEl.innerText.trim() : null;

        // 本文（Thinking要素を除去したコピーから変換）
        const clone = container.cloneNode(true);
        if (thinkingEl) {
          clone.querySelectorAll('[class*="thinking"], [class*="reasoning"], details').forEach(e => e.remove());
        }

        const mdContent = this.convertElementToMarkdown(clone);

        turns.push({
          role: isUser ? 'user' : 'model',
          content: mdContent.trim(),
          thinking: thinkingText
        });
      });
    } else {
      // フォールバック: テキスト全体から推測
      const text = document.body.innerText;
      turns.push({
        role: 'model',
        content: text.slice(0, 5000),
        thinking: null
      });
    }

    return turns;
  }

  /**
   * HTML要素を正確なMarkdown構文に変換するパーサー
   */
  convertElementToMarkdown(element) {
    if (!element) return '';

    // コードブロックの事前保護
    element.querySelectorAll('pre').forEach(pre => {
      const code = pre.querySelector('code');
      const lang = code?.className?.replace(/language-/, '') || pre.getAttribute('data-language') || '';
      const text = code ? code.innerText : pre.innerText;
      pre.setAttribute('data-md-code', `\n\`\`\`${lang}\n${text}\n\`\`\`\n`);
    });

    // テーブルの変換
    element.querySelectorAll('table').forEach(table => {
      let tableMd = '\n';
      const rows = Array.from(table.querySelectorAll('tr'));
      rows.forEach((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.innerText.replace(/\|/g, '\\|').trim());
        tableMd += `| ${cells.join(' | ')} |\n`;
        if (rIdx === 0) {
          tableMd += `| ${cells.map(() => '---').join(' | ')} |\n`;
        }
      });
      table.setAttribute('data-md-table', `${tableMd}\n`);
    });

    let result = '';

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      if (node.getAttribute('data-md-code')) {
        result += node.getAttribute('data-md-code');
        return;
      }

      if (node.getAttribute('data-md-table')) {
        result += node.getAttribute('data-md-table');
        return;
      }

      if (tag === 'h1') result += '\n# ';
      else if (tag === 'h2') result += '\n## ';
      else if (tag === 'h3') result += '\n### ';
      else if (tag === 'h4') result += '\n#### ';
      else if (tag === 'strong' || tag === 'b') result += '**';
      else if (tag === 'em' || tag === 'i') result += '*';
      else if (tag === 'code') result += '`';
      else if (tag === 'li') result += '\n- ';
      else if (tag === 'p') result += '\n\n';
      else if (tag === 'br') result += '\n';

      for (const child of node.childNodes) {
        walk(child);
      }

      if (tag === 'strong' || tag === 'b') result += '**';
      else if (tag === 'em' || tag === 'i') result += '*';
      else if (tag === 'code') result += '`';
      else if (tag === 'p') result += '\n';
    };

    walk(element);
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
