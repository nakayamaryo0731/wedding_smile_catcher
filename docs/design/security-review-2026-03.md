# セキュリティレビュー結果（2026年3月）

コードベース全体を対象としたセキュリティレビューの結果。
偽陽性フィルタリング済み。

---

## 検出された脆弱性

### 脆弱性1: 未認証ユーザーによる画像のソフトデリート（HIGH）

**ファイル:** `firestore.rules` 68-70行目
**信頼度:** 9/10

**内容:**
`images` コレクションの update ルールで、`deleted_at` フィールドの更新に認証チェックがない。

```
allow update: if (request.auth != null &&
  (isAdmin() || isEventOwner(resource.data.event_id)))
  || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['deleted_at']);
```

2つ目の OR 分岐に `request.auth != null` がないため、未認証ユーザーが任意の画像ドキュメントの `deleted_at` を設定できる。`images` コレクションは `allow read: if true` なので、全画像IDの列挙も可能。

**攻撃シナリオ:**
攻撃者がブラウザのDevToolsからFirebase SDKを初期化し、全画像を取得後、認証なしで `updateDoc` を実行。結婚式の進行中にランキングから全写真を消すことが可能。

**修正案:**
```
allow update: if request.auth != null &&
  (isAdmin() || isEventOwner(resource.data.event_id)
   || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['deleted_at']));
```

---

### 脆弱性2: 管理画面の申し込み詳細でのStored XSS（HIGH）

**ファイル:** `src/frontend/js/admin/applications.js` 176-231行目
**信頼度:** 9/10

**内容:**
`showApplicationDetail` 関数がFirestoreのデータを `innerHTML` にエスケープなしで直接挿入している。対象フィールド: `groom_name`, `bride_name`, `email`, `venue_name`, `referral_source`, `questions`。

`escapeHtml` ユーティリティは `utils.js` に存在し、他のファイル（`events.js` 等）では正しく使用されているが、`applications.js` ではインポートされていない。

`applications` コレクションは `allow create: if true` のため、未認証ユーザーが任意のデータを書き込める。

**攻撃シナリオ:**
攻撃者が `groom_name` に `<img src=x onerror=...>` のようなペイロードを含む申し込みを送信。管理者が申し込み詳細を開くと、管理者のFirebase Authセッションでスクリプトが実行され、全イベント・全画像・全ユーザーのデータにアクセス可能。

**修正案:**
```javascript
import { escapeHtml } from "../utils.js";

// showApplicationDetail 内の全てのユーザー入力フィールドにescapeHtmlを適用
<span>${escapeHtml(app.groom_name)} & ${escapeHtml(app.bride_name)}</span>
<a href="mailto:${escapeHtml(app.email)}">${escapeHtml(app.email)}</a>
<span class="detail-text">${escapeHtml(app.questions)}</span>
// venue_name, referral_source も同様に
```

---

## 偽陽性として除外した項目

| 項目 | 除外理由 |
|------|---------|
| `applications` コレクションの無制限公開書き込み | DOS/レートリミティングの除外対象。公開フォームとして意図的な設計 |
| `application-notify` のCORSワイルドカード | 公開フォームのエンドポイント。レスポンスに機密データなし。ハードニング不足であり脆弱性ではない |
| `scoring` Cloud Functionのアプリレベル認証不足 | TerraformでIAM認証がインフラレベルで強制されている。webhook SAのみが呼び出し権限を持つ |
| `events` コレクションの未認証テーマ更新 | コメントで意図的と明記。影響は外観のみ |
| IAM serviceAccountTokenCreator の自己付与 | GCPの署名付きURL生成の標準パターン。SA単位でスコープされている |

---

## 安全と確認された項目

| 項目 | 状態 |
|------|------|
| LINE Webhook署名検証（HMAC-SHA256） | OK |
| LIFF IDトークン検証（client_id照合） | OK |
| ハードコードされたシークレット | なし（全て環境変数/Secret Manager経由） |
| コマンドインジェクション | なし（subprocess等未使用） |
| Firestoreクエリインジェクション | なし（パラメータ化されたFieldFilter使用） |
| イベントコード・ユーザー名の入力検証 | OK（正規表現+長さチェック） |
| 管理画面のFirebase Auth IDトークン検証 | OK（notification関数で実装済み） |
| Cloud Storageバケット | OK（uniform_bucket_level_access、パブリックIAMなし） |
| セキュリティヘッダー | OK（HSTS、X-Content-Type-Options、X-Frame-Options、CSP設定済み） |
| ランキング画面のXSS対策 | OK（app.jsでescapeHtmlを正しく使用） |

---

## 対応判断

### 脆弱性1（Firestoreルール）— 対応見送り
- ランキング画面の設定パネルから、Firebase Auth未ログインの顧客がテストデータを削除する機能がある
- `request.auth != null` を必須にするとこの機能が壊れる
- event_idはUUID v4で推測不可能であり、ランキングURLを知らない限り攻撃不可
- **現実的なリスクは低いと判断し、現状維持**

### 脆弱性2（XSS）— 修正済み（2026-03-19）
- `applications.js` に `escapeHtml` をインポートし、全ユーザー入力フィールドに適用
- 対象: groom_name, bride_name, email, event_date, start_time, end_time, guest_count, venue_name, referral_source, questions, event_id
