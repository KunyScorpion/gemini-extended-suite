/**
 * Gemini Extended Suite - Content Script Entry Point
 * 各モジュールの読み込み確認、DOM Observer管理、公式スキル自動同期
 */

(function () {
  console.log('[Gemini Extended Suite] v1.0.0 initializing on Gemini Web...');

  // 1. 公式スキル管理ページ（/customize/skills）での自動スクレイピング＆同期
  function checkAndSyncOfficialSkillsPage() {
    if (window.location.href.includes('/customize/skills')) {
      console.log('[Gemini Extended Suite] On official skills page. Setting up auto-sync observer...');
      
      const syncSkillsFromDOM = async () => {
        // スキルカード・リスト項目の探索
        const skillCards = document.querySelectorAll(
          '[data-test-id*="skill"], .skill-item, [role="listitem"]:has([class*="skill"]), mat-card'
        );

        const extracted = [];
        skillCards.forEach((card, idx) => {
          const titleEl = card.querySelector('[class*="title"], [class*="name"], h2, h3, h4');
          const descEl = card.querySelector('[class*="description"], [class*="desc"], p');
          const iconEl = card.querySelector('[class*="icon"], [class*="avatar"]');

          const name = titleEl ? titleEl.textContent.trim() : null;
          const desc = descEl ? descEl.textContent.trim() : '';
          const icon = iconEl ? iconEl.textContent.trim() : '⚡';

          if (name && !extracted.some(s => s.name === name)) {
            extracted.push({
              id: `skill-auto-${idx}`,
              name: name.replace(/^@/, ''),
              icon: icon.length <= 4 ? icon : '⚡',
              desc: desc
            });
          }
        });

        if (extracted.length > 0) {
          const current = (await chrome.storage.local.get('geminiOfficialSkills')).geminiOfficialSkills || [];
          // マージ
          const merged = [...extracted];
          current.forEach(c => {
            if (!merged.some(m => m.name === c.name)) merged.push(c);
          });

          await chrome.storage.local.set({ geminiOfficialSkills: merged });
          console.log('[Gemini Extended Suite] Auto-synced official skills:', merged);
        }
      };

      // ページ読み込み後およびDOM変化時に同期
      setTimeout(syncSkillsFromDOM, 1000);
      const observer = new MutationObserver(() => syncSkillsFromDOM());
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // 2. DOM監視基盤の初期化起動
  function bootstrap() {
    if (window.geminiDomObserver) {
      window.geminiDomObserver.init();
      console.log('[Gemini Extended Suite] All modules registered and observer running');
      checkAndSyncOfficialSkillsPage();
    } else {
      setTimeout(bootstrap, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // 設定変更時の即時再適用
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.enableModelSwitcher && window.modelSwitcherModule) {
      window.modelSwitcherModule.enabled = changes.enableModelSwitcher.newValue;
      window.modelSwitcherModule.checkAndMount();
    }

    if (changes.enableSkillLauncher && window.skillLauncherModule) {
      window.skillLauncherModule.enabled = changes.enableSkillLauncher.newValue;
      window.skillLauncherModule.checkAndMount();
    }

    if (changes.enableSidebarFolders && window.sidebarFoldersModule) {
      window.sidebarFoldersModule.enabled = changes.enableSidebarFolders.newValue;
      window.sidebarFoldersModule.checkAndMount();
    }

    if (changes.enableMarkdownExport && window.exporterMdModule) {
      window.exporterMdModule.enabled = changes.enableMarkdownExport.newValue;
      window.exporterMdModule.checkAndMount();
    }

    if (changes.enableUsageMonitor && window.usageMonitorModule) {
      window.usageMonitorModule.enabled = changes.enableUsageMonitor.newValue;
      window.usageMonitorModule.checkAndMount();
    }

    if (changes.enableChatEnhancer && window.chatEnhancerModule) {
      window.chatEnhancerModule.enabled = changes.enableChatEnhancer.newValue;
      window.chatEnhancerModule.checkAndMount();
    }

    if (changes.fullWidthMode !== undefined && window.chatEnhancerModule) {
      window.chatEnhancerModule.applyFullWidth(changes.fullWidthMode.newValue);
    }
  });
})();
