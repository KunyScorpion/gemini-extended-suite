/**
 * Gemini Extended Suite - Content Script Entry Point
 * 各モジュールの読み込み確認とDOM Observerのライフサイクル管理
 */

(function () {
  console.log('[Gemini Extended Suite] v1.5.0 initializing on Gemini Web...');

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

    if (changes.enableThinkingSelector && window.thinkingSelectorModule) {
      window.thinkingSelectorModule.enabled = changes.enableThinkingSelector.newValue;
      window.thinkingSelectorModule.checkAndMount();
    }

    if (changes.enableSkillLauncher !== undefined && window.skillLauncherModule) {
      window.skillLauncherModule.enabled = changes.enableSkillLauncher.newValue;
      window.skillLauncherModule.checkAndMount();
    }

    if (changes.enableCharCount !== undefined && window.chatEnhancerModule) {
      window.chatEnhancerModule.enableCharCount = changes.enableCharCount.newValue;
      if (!window.chatEnhancerModule.enableCharCount) {
        const counter = document.getElementById(window.chatEnhancerModule.charCounterId);
        if (counter) counter.remove();
        window.chatEnhancerModule.removeResponseCharCounters();
      } else {
        window.chatEnhancerModule.checkAndMount();
      }
    }

    if (changes.enableTableOfContents !== undefined && window.chatEnhancerModule) {
      window.chatEnhancerModule.enableToc = changes.enableTableOfContents.newValue;
      if (!window.chatEnhancerModule.enableToc) {
        const toc = document.getElementById(window.chatEnhancerModule.tocContainerId);
        if (toc) toc.remove();
      } else {
        window.chatEnhancerModule.checkAndMount();
      }
    }

    if (changes.enableDesktopNotifications !== undefined && window.chatEnhancerModule) {
      window.chatEnhancerModule.enableNotification = changes.enableDesktopNotifications.newValue;
    }

    if (changes.fullWidthMode !== undefined && window.chatEnhancerModule) {
      window.chatEnhancerModule.applyFullWidth(changes.fullWidthMode.newValue);
    }
  });
})();
