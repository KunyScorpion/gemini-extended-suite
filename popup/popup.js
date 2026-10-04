/**
 * Gemini Extended Suite - popup.js
 * ポップアップ設定管理、スキル編集、バックアップ入出力
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. タブ切り替え
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = `tab-${btn.dataset.tab}`;
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  // 2. 機能トグルのバインディング
  const toggles = [
    { id: 'toggle-model-switcher', key: 'enableModelSwitcher' },
    { id: 'toggle-skill-launcher', key: 'enableSkillLauncher' },
    { id: 'toggle-sidebar-folders', key: 'enableSidebarFolders' },
    { id: 'toggle-markdown-export', key: 'enableMarkdownExport' },
    { id: 'toggle-usage-monitor', key: 'enableUsageMonitor' },
    { id: 'toggle-full-width', key: 'fullWidthMode' },
    { id: 'toggle-char-count', key: 'enableCharCount' },
    { id: 'toggle-toc', key: 'enableTableOfContents' },
    { id: 'toggle-notifications', key: 'enableDesktopNotifications' }
  ];

  const keys = toggles.map(t => t.key);
  const stored = await chrome.storage.local.get(keys);

  toggles.forEach(t => {
    const input = document.getElementById(t.id);
    if (!input) return;

    if (stored[t.key] !== undefined) {
      input.checked = !!stored[t.key];
    }

    input.addEventListener('change', () => {
      chrome.storage.local.set({ [t.key]: input.checked });
    });
  });

  // 3. スキル管理
  let skills = (await chrome.storage.local.get('skills')).skills || [];
  const skillListEl = document.getElementById('popup-skill-list');

  function renderSkills() {
    if (!skillListEl) return;
    skillListEl.innerHTML = '';

    if (skills.length === 0) {
      skillListEl.innerHTML = '<div style="font-size:11px;color:#94a3b8;padding:8px;">登録されたスキルがありません</div>';
      return;
    }

    skills.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = 'skill-card';
      card.innerHTML = `
        <div class="skill-card-info">
          <div class="skill-card-name">${s.icon || '⚡'} ${s.name}</div>
          <div class="skill-card-cmd">${s.command}</div>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" style="color:#ef4444;" data-del="${idx}">削除</button>
      `;

      card.querySelector('[data-del]').addEventListener('click', async () => {
        skills.splice(idx, 1);
        await chrome.storage.local.set({ skills });
        renderSkills();
      });

      skillListEl.appendChild(card);
    });
  }

  renderSkills();

  // スキル追加ボタン
  document.getElementById('btn-add-skill')?.addEventListener('click', async () => {
    const name = prompt('スキル名を入力してください (例: 要約アシスタント)');
    if (!name) return;
    const command = prompt('呼び出しコマンドを入力してください (例: /skill:summary )', `/skill:${name.toLowerCase().replace(/\s+/g, '-')} `);
    if (!command) return;

    const newSkill = {
      id: `skill-${Date.now()}`,
      name,
      icon: '⚡',
      command,
      description: ''
    };

    skills.push(newSkill);
    await chrome.storage.local.set({ skills });
    renderSkills();
  });

  // 4. バックアップ（エクスポート & インポート）
  document.getElementById('btn-export-backup')?.addEventListener('click', async () => {
    const allData = await chrome.storage.local.get(null);
    const jsonStr = JSON.stringify(allData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-extended-suite-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const statusEl = document.getElementById('backup-status');
    if (statusEl) statusEl.textContent = '設定データを書き出しました。';
  });

  const importTrigger = document.getElementById('btn-import-trigger');
  const fileInput = document.getElementById('file-import-input');

  importTrigger?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported === 'object' && imported !== null) {
          await chrome.storage.local.set(imported);
          const statusEl = document.getElementById('backup-status');
          if (statusEl) statusEl.textContent = 'インポートが正常に完了しました！';
          setTimeout(() => location.reload(), 1000);
        }
      } catch (err) {
        alert('無効なJSONファイルです: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
});
