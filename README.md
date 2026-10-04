# Gemini Extended Suite (Manifest V3)

> **対象ブラウザ**: Chromium系（Google Chrome & Microsoft Edge）  
> **対象プラットフォーム**: Gemini Web Interface (`gemini.google.com`) - Post-2026/10 Architecture  
> **バージョン**: 1.0.0

---

## 1. 概要
Gemini Web UI（2026年10月以降の新仕様：Gem廃止、スキル導入、タスク移行など）に対応した、オールインワン作業支援ブラウザ拡張機能です。  
クリエイティブワーク、長編創作、リサーチを快適に行うためのUI拡張、フォルダ整理、スレッド一括リネーム、プロンプト・スキルランチャー、高精度Markdownエクスポート機能を提供します。

---

## 2. 実装機能一覧

| 機能 | モジュール | 説明 |
| :--- | :--- | :--- |
| **Feature 1: モデル選択ワンタッチバー** | `model_switcher.js` | チャット入力欄直上にピル型ボタンを固定配置。ワンクリックで対象モデルへDOMシミュレーション切り替え。 |
| **Feature 2: スキル・タスク ランチャー** | `skill_launcher.js` | 入力欄下部にアウトラインボタンで配置。アコーディオン展開 ＆ 入力欄での `/` 入力によるインラインポップアップ補完（スラッシュコマンド）対応。 |
| **Feature 3: フォルダ管理 ＆ 一括リネーム** | `sidebar_folders.js` | サイドバー上部に「＋ 新規フォルダ」。D&Dでのスレッド分類、ローカル即時反映 ＋ 400msディレイでの公式サーバー順次同期ハイブリッドリネーム。 |
| **Feature 4: Markdown全文エクスポート** | `exporter_md.js` | ヘッダーに「📥 MD保存」ボタン。YAMLフロントマター、Thinking（思考ブロック）含有/除外切り替え、コード言語・表の完全抽出。 |
| **Feature 5: 使用量・クォータ常時インジケーター** | `usage_monitor.js` | 画面右上にゲージ＆パーセンテージ表示。残量に応じた緑/橙/赤のアラート変化、利用履歴ポップオーバー。 |
| **Feature 6: Chat Enhancer** | `chat_enhancer.js` | 📑目次・ミニマップ（Jump to Turn）、⤢全幅ワイド表示（85%〜100%）、🔢入力文字数・行数カウンター、🔔生成完了デスクトップ通知。 |
| **ポップアップ管理UI** | `popup/popup.html` | 各機能のON/OFFトグル、スキル登録・削除、フォルダおよび設定データのJSONバックアップ・リストア。 |

---

## 3. インストール・読み込み手順（開発者モード）

1. **Google Chrome または Microsoft Edge** を開きます。
2. アドレスバーに以下を入力して拡張機能の管理画面を開きます:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 画面右上（または左側）の **「デベロッパー モード（開発者モード）」** をオンにします。
4. **「パッケージ化されていない拡張機能を読み込む」**（Edgeでは「展開して読み込み」）をクリックします。
5. 本プロジェクトフォルダ（`c:\AI\Antigravity\gemini-extended-suite`）を選択します。
6. `https://gemini.google.com` にアクセスすると、拡張機能の各種機能が自動的に有効化されます。

---

## 4. ディレクトリ構成

```plaintext
gemini-extended-suite/
├── manifest.json              # Manifest V3 構成ファイル
├── background/
│   └── service_worker.js      # 通知、バックグラウンドタスク、タブ管理
├── content/
│   ├── content.js             # エントリーポイント / DOM初期化
│   ├── dom_observer.js        # MutationObserver管理、SPA画面遷移監視
│   ├── modules/
│   │   ├── model_switcher.js  # モデル選択バー（ワンタッチボタン）
│   │   ├── skill_launcher.js  # スキル/タスク呼び出しランチャー
│   │   ├── sidebar_folders.js # フォルダ管理 ＆ ハイブリッド一括リネーム
│   │   ├── exporter_md.js     # チャット全文Markdownエクスポート
│   │   ├── usage_monitor.js   # 使用量/クォータインジケーター常時視認化
│   │   └── chat_enhancer.js   # 目次・ミニマップ、ワイド表示、文字数カウント
│   └── styles/
│       ├── main.css           # 全体スタイル・CSS変数
│       ├── components.css     # 独自UIパーツ（ボタン、チップ、モーダル）
│       └── injected_theme.css # Gemini公式UIの微調整（Full-Width等）
├── popup/
│   ├── popup.html             # 設定・ショートカット一覧
│   ├── popup.js
│   └── popup.css
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md
```
