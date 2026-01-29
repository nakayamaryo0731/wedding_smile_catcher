# リリースTODO一覧

各ドキュメントから集約したリリースまでに必要なタスク。
優先度・フェーズごとに整理する。

最終更新: 2026-01-28

---

## 凡例

- **優先度**: P0（ブロッカー）/ P1（MVP必須）/ P2（品質向上）/ P3（Phase 2以降）
- **状態**: 🔲 未着手 / 🔨 進行中 / ✅ 完了

---

## 1. マルチテナント対応（P0）

ref: `docs/planning/multi-tenant-design.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 1.1 | `accounts` コレクション追加 | ✅ | Firebase Auth自体がアカウント管理。`events.account_id == auth.uid` で認可 |
| 1.2 | `events` コレクションに `account_id`, `event_code` フィールド追加 | ✅ | `account_id`, `event_code` 実装済。テスト管理は `status` フィールド（draft/test/active/archived）で対応 |
| 1.3 | `users` コレクションに `join_status` フィールド追加 | ✅ | `pending_name` / `registered` フロー動作確認済 |
| 1.4 | webhook: JOIN コマンドハンドラ実装 | ✅ | `handle_join_event` 関数。E2Eテスト済 |
| 1.5 | webhook: `handle_text_message` をJOINフローに対応 | ✅ | 4分岐ルーティング実装済 |
| 1.6 | webhook: `handle_image_message` からCURRENT_EVENT_ID依存を除去 | ✅ | ユーザーの `event_id` を参照 |
| 1.7 | webhook: `handle_follow` をシンプルな歓迎メッセージに変更 | ✅ | ディープリンクがJOINを自動送信するため |
| 1.8 | `CURRENT_EVENT_ID` 環境変数を完全に廃止 | ✅ | webhook・terraform から完全削除 |
| 1.9 | イベントコード自動生成ロジック実装 | ✅ | UUID v4 `create_event.py` に実装済 |
| 1.10 | ディープリンクQRコード生成機能 | ✅ | admin.js `showQRModal` + QRCode.js。イベント作成時に自動表示 |
| 1.11 | 1ゲストが複数イベントに参加するケースの対応 | ✅ | 複合キー `{line_user_id}_{event_id}` で設計済み |

---

## 2. 認証・認可（P0）

ref: `docs/planning/security-requirements.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 2.1 | Firebase Authentication 導入 | ✅ | メール + パスワード |
| 2.2 | 管理画面: SHA-256パスワード認証をFirebase Authに置換 | ✅ | `signInWithEmailAndPassword` に置換済 |
| 2.3 | 管理画面: ログイン/ログアウトUI実装 | ✅ | `admin.html` 更新済 |
| 2.4 | 管理画面: 自分のイベントのみ表示するフィルタ | ✅ | `account_id == currentUser.uid` フィルタ実装済 |
| 2.5 | Firestore Security Rules 更新 | ✅ | マルチテナント対応ルール実装済 |
| 2.6 | Firestore Security Rules のテスト | 🔲 | |

---

## 3. セルフサービス機能（P1）

ref: `docs/planning/mvp-features.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 3.1 | 顧客アカウント登録画面 | ✅ | admin.html 登録フォーム。利用規約同意チェックボックス付き |
| 3.2 | イベント作成フォーム | ✅ | admin.html イベント名・日付入力フォーム |
| 3.3 | イベントコード + QRコード + ランキングURL自動発行 | ✅ | 作成完了後に QR モーダル自動表示 |
| 3.4 | イベント管理画面（顧客向けダッシュボード） | ✅ | イベントカード一覧、QR/Ranking URL、ステータス管理 |
| 3.5 | 運営者によるイベント有効化機能（status: draft → active） | ✅ | 管理画面の Activate ボタン。有効化時にテストデータ自動削除 |

---

## 4. 事前テストフロー（P1）

ref: `docs/planning/mvp-features.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 4.1 | テスト投稿機能（顧客自身がBotからテスト可能） | ✅ | Phase 1-b-1 で webhook 対応済 |
| 4.2 | テスト完了チェック（テスト成功の確認UI） | ✅ | admin.js テストセクション |
| 4.3 | テストデータ一括削除機能 | ✅ | 有効化時の自動削除 + 手動削除ボタン |
| 4.4 | 利用ガイドに事前テスト手順を記載 | ✅ | `docs/usage-guide.md` |

---

## 5. セキュリティ強化（P1）

ref: `docs/planning/security-requirements.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 5.1 | スコアリングのフォールバック実装（API障害時のグレースフルデグラデーション） | ✅ | Vision API: 0点フォールバック、Vertex AI: 50点フォールバック、Hash: エラースキップ、LINE: 3回リトライ |
| 5.2 | Cloud Storage 画像アクセスを署名付きURLに変更 | ✅ | 7日間有効期限。アップロード時とスコアリング完了時に生成 |
| 5.3 | ランキング表示の画像URLリフレッシュ頻度を検討・実装 | ✅ | 7日間有効のため定期更新不要（イベントは1日で完了） |
| 5.4 | 入力バリデーション強化（イベントコード、ユーザー名） | ✅ | イベントコード: 英数字+ハイフン、ユーザー名: 1-50文字 |
| 5.5 | LINE署名検証（`X-Line-Signature`）が正しく動作していることを確認 | ✅ | `handler.handle(body, signature)` + `InvalidSignatureError` ハンドリング確認済 |
| 5.6 | 環境変数・シークレットがGCP Secret Managerで管理されていることを確認 | ✅ | Terraform `secret_environment_variables` で Cloud Functions に注入 |
| 5.7 | LINE Botのunsend対応（写真取消時にCloud Storage + Firestoreから削除） | ✅ | LINE User Data Policy 準拠。UnsendEventハンドラ実装済 |

---

## 6. 法務・規約（P1）

ref: `docs/planning/terms-of-service.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 6.1 | 利用規約ページをフロントエンドに実装 | ✅ | `/terms` タブUIで実装 |
| 6.2 | プライバシーポリシーページをフロントエンドに実装 | ✅ | `/privacy` タブUIで実装 |
| 6.3 | 特定商取引法に基づく表記ページを実装 | ✅ | `/commerce` タブUIで実装 |
| 6.4 | アカウント作成時の同意フロー実装 | ✅ | チェックボックス + `terms_accepted_at` 記録 |
| 6.5 | 法律専門家によるレビュー | 🔲 | リリース前に推奨 |
| 6.6 | 連絡先・住所など具体的情報の記入 | 🔲 | |
| 6.7 | Google / LINE のデータ処理規約との整合性確認 | ✅ | プライバシーポリシーに反映済み |
| 6.8 | LINE Bot初回メッセージで写真処理の同意確認ステップ実装 | ✅ | 登録完了時に同意メッセージ表示。LINE User Data Policy 準拠 |
| 6.9 | LINE Botリッチメニューにプライバシーポリシーリンク設置 | ✅ | `scripts/setup_rich_menu.py` で設定 |

---

## 7. 運用・監視（P2）

ref: `docs/planning/security-requirements.md`, `docs/planning/mvp-features.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 7.1 | Cloud Monitoring ダッシュボード設定 | 🔲 | エラー率、レイテンシ |
| 7.2 | アラート通知設定（メール） | 🔲 | Cloud Functions エラー、Firestore異常 |
| 7.3 | データ自動削除の仕組み（イベント後30日） | 🔲 | Cloud Scheduler + Cloud Functions |
| 7.4 | 管理画面から画像一括ダウンロード機能のUI実装 | ✅ | Imagesタブから選択してZIPダウンロード |

---

## 8. バイラル・マーケティング（P2）

ref: `docs/planning/public-release-roadmap.md`, `docs/planning/competitor-analysis.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 8.1 | イベント終了後LINE通知（サービス紹介）実装 | 🔲 | MVP。バイラル施策 |
| 8.2 | ランキング画面にサービスロゴ表示（控えめに） | 🔲 | |
| 8.3 | サービスロゴ・ブランドアセット制作 | 🔲 | |
| 8.4 | ランキング画面のスクリーンショット素材撮影 | 🔲 | デモデータ使用 |
| 8.5 | スライドショーモードのスクリーンショット素材撮影 | 🔲 | |
| 8.6 | LINE Botトーク画面のスクリーンショット素材撮影 | 🔲 | スコア返信例 |
| 8.7 | QRコード付き説明書テンプレート作成 | 🔲 | ゲスト配布用 |
| 8.8 | 使い方フロー図（3ステップ）制作 | 🔲 | LP・出品ページ用 |

---

## 9. 販売準備（P3 - Phase 2）

ref: `docs/planning/landing-page-requirements.md`, `docs/planning/competitor-analysis.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 9.1 | ココナラ出品ページ作成 | 🔲 | 商品タイトル、説明文、サムネイル |
| 9.2 | 初期価格設定（9,800円で実績作り） | 🔲 | 5件レビュー後に15,000円に値上げ |

---

## 10. Phase 3以降（P3）

ref: `docs/planning/public-release-roadmap.md`, `docs/planning/mvp-features.md`

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 10.1 | LP作成 | 🔲 | Stripeは採用しない方針 |
| 10.2 | カスタムドメイン取得・設定 | 🔲 | |
| 10.3 | 紹介割引コード機能 | 🔲 | |
| 10.4 | イベント後アルバムページ | 🔲 | ゲスト閲覧用 |

---

## 11. ドキュメント整備

| # | タスク | 状態 | 備考 |
|---|--------|------|------|
| 11.1 | 全体方針（ロードマップ） | ✅ | `public-release-roadmap.md` |
| 11.2 | MVP機能定義 | ✅ | `mvp-features.md` |
| 11.3 | マルチテナント設計 | ✅ | `multi-tenant-design.md` |
| 11.4 | セキュリティ要件 | ✅ | `security-requirements.md` |
| 11.5 | 利用規約・プライバシーポリシー | ✅ | `terms-of-service.md` |
| 11.6 | LP要件定義 | ✅ | `landing-page-requirements.md` |
| 11.7 | 競合分析 | ✅ | `competitor-analysis.md` |
| 11.8 | リリースTODO一覧（本ドキュメント） | ✅ | `release-todo.md` |
| 11.9 | 全ドキュメントの整合性レビュー | ✅ | 12件の指摘を修正済み |

---

## リリースまでの推奨順序

```
Phase 0: 設計・ドキュメント ✅
  ├── 11.9 全ドキュメント整合性レビュー ✅
  └── 1.11 複数イベント参加の設計課題を解決 ✅

Phase 1-a: 基盤（認証・マルチテナント） ✅
  ├── 2.1〜2.5 Firebase Auth + Security Rules ✅
  ├── 1.1〜1.3 Firestoreスキーマ変更 ✅
  ├── 1.4〜1.9 webhook フロー変更 + イベントコード生成 ✅
  └── 2.6 Security Rules テスト 🔲

Phase 1-b: セルフサービス ✅
  ├── 1.10 QRコード生成 ✅
  ├── 3.1〜3.4 顧客向けUI ✅
  └── 4.1〜4.3 事前テストフロー ✅

Phase 1-c: セキュリティ・法務
  ├── 5.1〜5.5 セキュリティ強化
  ├── 6.1〜6.4 規約ページ実装
  └── 6.5〜6.7 法務確認

Phase 1-d: 運用準備
  ├── 7.1〜7.4 監視・運用
  ├── 8.1〜8.2 ブランドアセット
  └── 4.4 利用ガイド

Phase 1-e: リリース判定
  ├── 知人1-2名でβテスト
  └── MVPリリース判定基準の全項目クリア確認

Phase 2: 販売開始
  ├── 8.3〜8.8 マーケティング素材
  └── 9.1〜9.2 ココナラ出品

Phase 3: スケール
  └── 10.1〜10.4 LP・決済・追加機能
```

---

## 未解決の論点

各ドキュメントに散在する「要検討」事項を集約:

1. ~~**1ゲスト複数イベント問題**~~ → ✅ 解決済み。複合キー `{line_user_id}_{event_id}` を採用（`multi-tenant-design.md` セクション10）

2. ~~**署名付きURLのリフレッシュ頻度**~~ → ✅ 方針決定済み。署名付きURL（短い有効期限）を採用、バックエンドプロキシは不要（`security-requirements.md` セクション3.3）

3. ~~**イベント前キャンセルの返金ポリシー詳細**~~ → ✅ 定義済み。7日前全額 / 7〜3日前半額 / 3日前以降なし（`terms-of-service.md` 第6条）

4. ~~**未成年の利用に関する条項**~~ → ✅ 追加済み。保護者の同意を条件に利用可（`terms-of-service.md` 第12条）

5. ~~**外部サービス障害時の返金ポリシー**~~ → ✅ 免責に決定。規約に明記（`terms-of-service.md` 第6条）
