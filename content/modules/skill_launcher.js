/**
 * Gemini Extended Suite - Feature 8: 公式 @SKILL ワンクリック呼び出し (Skill Launcher)
 * 2026年9月以降のGemini公式仕様（GemからSKILLへの移行および @ メンション呼び出し）に対応し、
 * ボタン1つで公式の @SKILL オートコンプリートメニューを即座に起動するモジュール
 */

class SkillLauncherModule {
  constructor() {
    this.containerId = 'g-ext-skill-launcher-root';
    this.thinkingContainerId = 'g-ext-thinking-level-root';
    this.enabled = true;
  }

  async init() {
    const data = await chrome.storage.local.get(['enableSkillLauncher']);
    this.enabled = data.enableSkillLauncher !== false;

    window.addEventListener('load', () => this.checkAndMount());
    window.addEventListener('g-ext-url-changed', () => {
      setTimeout(() => this.checkAndMount(), 150);
      setTimeout(() => this.checkAndMount(), 500);
    });

    this.checkAndMount();
  }

  checkAndMount() {
    if (!this.enabled) {
      this.removeUI();
      return;
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

  /**
   * マウント先アンカーの特定
   * 思考レベル切替ボタン（#g-ext-thinking-level-root）が存在すればそのすぐ左隣、
   * 存在しない（または無効の）場合はモデルピッカーの左隣を特定する
   */
  findMountAnchor() {
    const thinkingRoot = document.getElementById(this.thinkingContainerId);
    if (thinkingRoot && thinkingRoot.parentElement) {
      return {
        parent: thinkingRoot.parentElement,
        beforeElement: thinkingRoot
      };
    }

    // 思考レベル切替モジュールが利用可能な場合はそのアンカー探索ロジックを活用
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
    btn.title = '公式 @SKILL サジェストメニューをワンクリック起動';
    btn.innerHTML = `<span class="g-ext-skill-launcher-icon">⚡</span><span>@SKILL</span>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.triggerSkillMention();
    });

    if (beforeElement) {
      parent.insertBefore(btn, beforeElement);
    } else {
      parent.appendChild(btn);
    }

    console.log('[Gemini Extended Suite] @SKILL Quick Launcher mounted in toolbar');
  }

  removeUI() {
    const el = document.getElementById(this.containerId);
    if (el) el.remove();
  }

  /**
   * Geminiの入力欄へ @ をプログラム注入し、公式のSKILL選択ポップアップを展開する
   */
  triggerSkillMention() {
    // 1. エディタ要素の特定
    const editor = document.querySelector(
      'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"]'
    );

    if (!editor) {
      console.warn('[Gemini Extended Suite] Chat input editor not found');
      return;
    }

    // 2. フォーカスとキャレット（カーソル）の末尾移動
    editor.focus();

    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false); // 末尾へ移動
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // 既存テキストの末尾状態を確認（Quillの空行用末尾改行1つを除外して判定）
    const rawText = (editor.innerText || editor.textContent || '').replace(/\n$/, '');

    // 4. 連続クリック防止（スマートガード）: すでに末尾が @ の場合は二重入力せずイベント再送のみ
    if (rawText.endsWith('@')) {
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        inputType: 'insertText',
        data: '@'
      }));
      editor.dispatchEvent(new KeyboardEvent('keyup', {
        key: '@',
        code: 'Digit2',
        bubbles: true
      }));
      return;
    }

    // 末尾が空白でない文字で終わっている場合は、メンション認識を確実にするため半角スペース ' ' を先に入れる
    if (rawText.length > 0 && !/[\s\u3000]$/.test(rawText)) {
      this._insertTextIntoEditor(editor, ' ');
    }

    // 3. ネイティブ入力コマンドと InputEvent の複合ディスパッチで '@' を注入
    // Step A: beforeinput イベントの発火
    const beforeInputEvt = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: '@'
    });
    editor.dispatchEvent(beforeInputEvt);

    // Step B: execCommand によるネイティブテキスト挿入（Quill/ProseMirrorのMutation/Selection検知を確実に起動）
    const inserted = document.execCommand('insertText', false, '@');

    // Step C: フォールバック（execCommandが効かない環境向け）
    if (!inserted) {
      const currentSel = window.getSelection();
      if (currentSel && currentSel.rangeCount > 0) {
        const range = currentSel.getRangeAt(0);
        const textNode = document.createTextNode('@');
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        currentSel.removeAllRanges();
        currentSel.addRange(range);
      }
    }

    // Step D: input および keyup イベントの発火でAngular/Quillのサジェストリスナーを強制トリガー
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertText',
      data: '@'
    }));
    editor.dispatchEvent(new KeyboardEvent('keyup', {
      key: '@',
      code: 'Digit2',
      bubbles: true
    }));
  }

  /**
   * 補助文字（半角スペース等）の挿入ヘルパー
   */
  _insertTextIntoEditor(editor, char) {
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: char
    }));

    const inserted = document.execCommand('insertText', false, char);
    if (!inserted) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const textNode = document.createTextNode(char);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertText',
      data: char
    }));
  }
}

// 登録
window.skillLauncherModule = new SkillLauncherModule();
window.skillLauncherModule.init().then(() => {
  if (window.geminiDomObserver) {
    window.geminiDomObserver.registerModule('skillLauncher', window.skillLauncherModule);
  }
});
