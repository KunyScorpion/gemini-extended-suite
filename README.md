# Gemini Extended Suite (Manifest V3)

> **対象ブラウザ**: Chromium系（Google Chrome & Microsoft Edge）  
> **対象プラットフォーム**: Gemini Web Interface (`gemini.google.com`)  
> **バージョン**: 1.3.1

---

## 1. 概要
Gemini Web UIに対応した、オールインワン作業支援ブラウザ拡張機能です。  
クリエイティブワーク、長編創作、リサーチを快適に行うためのスレッドフォルダ整理、高精度Markdownエクスポート、公式使用状況（`https://gemini.google.com/usage`）連携、目次ジャンプ、プロンプト入力およびAI返答のリアルタイム文字数カウント機能を提供します。

---

## 2. 機能一覧

| 機能 | モジュール | 説明 |
| :--- | :--- | :--- |
| **フォルダ管理（クイック移動）** | `sidebar_folders.js` | サイドバー上部に「＋ 新規フォルダ」。スレッド横の「📁」ボタンからワンクリックでフォルダへ確実に振り分け。 |
| **Markdown全文エクスポート** | `exporter_md.js` | 画面右上バーに「📥 MD保存」ボタン。YAMLフロントマター、思考プロセス（Thinking）含有/除外切り替え、コード言語・表の完全抽出。 |
| **公式使用状況・上限常時表示** | `usage_monitor.js` | 公式URL `https://gemini.google.com/usage` から本物の使用量（現在の使用量、リセット時刻、1週間の上限等）を正確に同期・表示。 |
| **Chat Enhancer** | `chat_enhancer.js` | 📑目次・ミニマップ（高速点滅防止＆スムーズジャンプ）、⤢全幅ワイド表示（85%〜100%）、🔢入力＆AI返答メッセージのリアルタイム文字数・行数カウンター（返答フッターにひっそり表示、思考プロセス内訳対応）、🔔生成完了デスクトップ通知。 |
| **ポップアップ管理画面** | `popup/popup.html` | 各機能のON/OFFトグル、フォルダおよび設定データのJSONバックアップ・リストア。 |

---

## 3. インストール・再読み込み手順（開発者モード）

1. **Google Chrome または Microsoft Edge** を開きます。
2. アドレスバーに以下を入力:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 画面の **「デベロッパー モード（開発者モード）」** をオンにします。
4. 既に読み込み済みの場合は、**「更新（リロードアイコン ↻）」** をクリックします。
5. `https://gemini.google.com` にアクセス（またはF5で再読み込み）すると、最新の機能が反映されます。
