/**
 * Gemini Extended Suite - Content Script Entry Point
 * 各モジュールの読み込み確認とDOM Observerのライフサイクル管理
 */

(function () {
  console.log('[Gemini Extended Suite] v1.0.0 initializing on Gemini Web...');

  // DOM監視基盤の初期化起動
  function bootstrap() {
    if (window.geminiDomObserver) {
      window.geminiDomObserver.init();
      console.log('[Gemini Extended Suite] All modules registered and observer running');
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
