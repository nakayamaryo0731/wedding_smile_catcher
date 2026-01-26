# マルチテナント設計

複数の顧客（カップル）が同時にイベントを開催できるようにするための設計。

最終更新: 2026-01-26

---

## 1. 現状と課題

### 現状

- `CURRENT_EVENT_ID` 環境変数で1イベントのみ対応
- Cloud Functions の webhook / scoring がその1イベントに固定
- 管理画面は全データにアクセス可能（権限分離なし）

### 課題

- 複数イベントの同時開催が不可能
- 環境変数の切り替えにデプロイが必要
- 顧客ごとのデータ分離ができていない

---

## 2. 設計方針

### テナント = イベント

- 1顧客 = 1アカウント、1アカウントに対して N個のイベント
- データ分離は `event_id` フィールドで行う（論理分離）
- Firestore のコレクションは共有（物理的には同一）

### LINE Bot = 共通

- 1つのLINE公式アカウントで全イベントを管理
- ゲストはイベントコード（ディープリンク経由）でイベントに参加

---

## 3. Firestoreコレクション変更

### 追加: `accounts` コレクション

顧客（カップル）のアカウント情報。

| フィールド | 型 | 説明 |
|-----------|------|------|
| `email` | string | メールアドレス（Firebase Auth と連携） |
| `display_name` | string | 表示名 |
| `created_at` | timestamp | 作成日時 |
| `status` | string | `active` / `suspended` |

```json
{
  "email": "tanaka@example.com",
  "display_name": "田中太郎 & 花子",
  "created_at": "2026-01-01T00:00:00Z",
  "status": "active"
}
```

ドキュメントID: Firebase Auth の UID

### 変更: `events` コレクション

既存の events コレクションに以下を追加。

| フィールド | 型 | 説明 | 新規 |
|-----------|------|------|------|
| `account_id` | string | アカウントID（Firebase Auth UID） | ✅ |
| `event_code` | string | ゲスト参加用コード（UUID v4） | ✅ |
| `event_name` | string | イベント名 | 既存 |
| `event_date` | string | イベント日付 | 既存 |
| `status` | string | `draft` / `active` / `archived` | 既存 |
| `test_completed` | boolean | 事前テスト完了フラグ | ✅ |
| `created_at` | timestamp | 作成日時 | 既存 |

```json
{
  "account_id": "firebase_uid_xxx",
  "event_code": "550e8400-e29b-41d4-a716-446655440000",
  "event_name": "田中太郎 & 花子 結婚式",
  "event_date": "2026-03-15",
  "status": "active",
  "test_completed": true,
  "created_at": "2026-01-01T00:00:00Z"
}
```

**status の遷移（イベント有効化フロー）**:
```
顧客がイベント作成 → status: draft（ゲスト参加不可）
  ↓
運営者が支払い確認後、手動で status を active に変更
  ↓
status: active（ゲスト参加可能、スコアリング稼働）
  ↓
イベント終了後 → status: archived
```

- 自前決済（Stripe等）は導入しない方針のため、支払い確認 → 有効化は運営者が手動で行う
- Phase 1（知人紹介）: 振込確認後に有効化
- Phase 2（ココナラ）: ココナラ購入確認後に有効化
- 管理画面または CLI からステータス変更が可能であること

**event_code について**:
- UUID v4（例: `550e8400-e29b-41d4-a716-446655440000`）
- 自動生成、衝突リスクなし
- ディープリンクQRコード経由で自動入力されるため、ゲストが手入力する場面はない

### 変更: `users` コレクション

| フィールド | 変更 | 説明 |
|-----------|------|------|
| `event_id` | 既存 | 変更なし。JOIN コマンドで動的に設定される |
| `join_status` | ✅ 追加 | `pending_name` / `registered` |

```
ゲストの状態遷移:
  JOIN送信 → pending_name（名前入力待ち）※ ユーザードキュメント作成
  名前送信 → registered（登録完了）

  ※ Bot追加のみ（JOINなし）の場合はドキュメント未作成
```

### images

スキーマ変更なし。既に `event_id` でデータ分離されている。
ただし、`handle_image_message` での Cloud Storage パスも `CURRENT_EVENT_ID` → ユーザーの `event_id` に変更が必要:

```python
# 変更前
storage_path = f"{CURRENT_EVENT_ID}/original/{user_id}/{timestamp}_{image_id}.jpg"

# 変更後
storage_path = f"{event_id}/original/{user_id}/{timestamp}_{image_id}.jpg"
```

### ranking

`ranking` コレクションは `docs/architecture/database.md` に設計があるが、現時点では未実装。
フロントエンドは `images` コレクションを直接クエリしている。
マルチテナント対応の影響なし（実装時にはイベント別にドキュメントを分離する設計済み）。

---

## 4. LINE Bot フロー変更

### 現状のフロー

```
1. Bot追加
2. 名前をテキスト送信 → ユーザー登録（CURRENT_EVENT_IDに紐付け）
3. 画像投稿 → スコアリング
```

### 新しいフロー

```
1. QRコードスキャン → Bot追加
   └── ディープリンクで「JOIN {event_code}」が自動入力される
2. 「JOIN {event_code}」を送信
   └── event_code → event_id を解決
   └── users ドキュメント作成（join_status: pending_name）
3. 名前をテキスト送信
   └── ユーザー登録完了（join_status: registered）
4. 画像投稿 → スコアリング（event_idはユーザーから取得）
```

### webhook の変更点

#### handle_follow（フォローイベント）

通常フロー（QRディープリンク経由）では、Bot追加直後に「JOIN {event_code}」が自動送信される。
そのため、follow メッセージはシンプルな歓迎のみとし、イベントコード案内は不要。

```python
# 変更前
if not user_doc.exists:
    message = "まずはお名前を送信してください"

# 変更後
if not user_doc.exists:
    message = "ようこそ！😊"
    # ディープリンク経由の場合、直後に JOIN メッセージが自動送信される
    # 直接Bot追加の場合は、handle_text_message の Case 4 でイベントコード案内
```

#### handle_text_message（テキストメッセージ）

```python
def handle_text_message(event):
    user_id = event.source.user_id
    text = event.message.text.strip()

    # Case 1: JOIN コマンド（イベント参加）
    if text.upper().startswith("JOIN "):
        event_code = text[5:].strip()
        handle_join_event(user_id, event_code, event.reply_token)
        return

    # Case 2: 名前入力待ちのユーザーを検索（複合キー対応）
    pending_docs = (
        db.collection("users")
        .where("line_user_id", "==", user_id)
        .where("join_status", "==", "pending_name")
        .limit(1)
        .get()
    )
    if pending_docs:
        user_ref = pending_docs[0].reference
        register_user_name(user_ref, text, event.reply_token)
        return

    # Case 3: 登録済みユーザーのコマンド処理
    registered_docs = (
        db.collection("users")
        .where("line_user_id", "==", user_id)
        .where("join_status", "==", "registered")
        .get()
    )
    if registered_docs:
        # 最新のイベントのユーザードキュメントを使用
        user_ref = registered_docs[0].reference
        handle_command(text, event.reply_token, user_ref)
        return

    # Case 4: 未参加（イベントコード促し）
    message = "まずイベントに参加してください。\nQRコードを読み取るか、イベントコードを送信してください。"
    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=message))
```

#### handle_join_event（新規関数）

```python
def handle_join_event(user_id, event_code, reply_token):
    # event_code から event_id を検索
    events_query = (
        db.collection("events")
        .where("event_code", "==", event_code)
        .where("status", "==", "active")
        .limit(1)
        .get()
    )

    if not events_query:
        message = "イベントコードが見つかりません。\nコードを確認してもう一度お試しください。"
        line_bot_api.reply_message(reply_token, TextSendMessage(text=message))
        return

    event_doc = events_query[0]
    event_id = event_doc.id
    event_name = event_doc.to_dict().get("event_name", "")

    # ユーザードキュメント作成（複合キー: {line_user_id}_{event_id}）
    doc_id = f"{user_id}_{event_id}"
    user_ref = db.collection("users").document(doc_id)
    user_ref.set({
        "line_user_id": user_id,
        "event_id": event_id,
        "join_status": "pending_name",
        "created_at": firestore.SERVER_TIMESTAMP,
        "total_uploads": 0,
        "best_score": 0,
    })

    message = f"「{event_name}」に参加しました！\n\nお名前（フルネーム）を送信してください。\n例: 山田太郎"
    line_bot_api.reply_message(reply_token, TextSendMessage(text=message))
```

#### handle_image_message（画像メッセージ）

```python
# 変更前
CURRENT_EVENT_ID = os.environ.get("CURRENT_EVENT_ID")
# ...
image_ref.set({
    "event_id": CURRENT_EVENT_ID,
    ...
})

# 変更後（ユーザーの event_id を使用）
user_data = user_doc.to_dict()
event_id = user_data.get("event_id")
# ...
image_ref.set({
    "event_id": event_id,
    ...
})
```

---

## 5. Cloud Functions の変更

### CURRENT_EVENT_ID の廃止

| 変更前 | 変更後 |
|--------|--------|
| `CURRENT_EVENT_ID` 環境変数 | ユーザーの `event_id` フィールドから動的取得 |
| 1イベント固定 | 複数イベント同時対応 |
| デプロイで切り替え | 切り替え不要 |

### webhook/main.py

- `CURRENT_EVENT_ID` 定数を削除
- `handle_text_message` を上記の新フローに変更
- `handle_image_message` でユーザーの `event_id` を参照

### scoring/main.py

- 変更不要（既に `image_data.get("event_id")` で動的取得している）

---

## 6. 管理画面の変更

### 認証

- SHA-256パスワード → **Firebase Authentication**
- 顧客はメール + パスワードでログイン

### アクセス制御

- ログイン中のユーザーの `account_id` を取得
- `events` コレクションで `account_id` が一致するイベントのみ表示
- 画像・ユーザーも対応する `event_id` でフィルタ

```javascript
// 自分のイベント一覧を取得
const eventsQuery = query(
  collection(db, "events"),
  where("account_id", "==", currentUser.uid)
);
```

### 新規画面: イベント作成

```
イベント作成フォーム:
├── イベント名（必須）
├── イベント日付（必須）
└── 作成ボタン
    ├── event_code 自動生成
    ├── ディープリンクQRコード生成
    └── ランキング画面URL表示
```

---

## 7. Firestore Security Rules 変更

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // accounts: 本人のみ読み書き可能
    match /accounts/{accountId} {
      allow read, write: if request.auth != null && request.auth.uid == accountId;
    }

    // events: 所有者のみ書き込み可能、読み取りはログイン済みユーザー
    match /events/{eventId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && resource.data.account_id == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.account_id == request.auth.uid;
    }

    // users: Cloud Functions（サービスアカウント）のみ書き込み
    // フロントエンドからは所有イベントのユーザーのみ読み取り可能
    match /users/{userId} {
      allow read: if true;  // ランキング表示に必要
      allow write: if false; // Cloud Functions のみ
    }

    // images: ランキング表示のため読み取り可能、書き込みは Cloud Functions のみ
    match /images/{imageId} {
      allow read: if true;
      allow write: if false; // Cloud Functions のみ
    }
  }
}
```

---

## 8. 移行計画

### 既存データの扱い

- 既存のイベント・画像・ユーザーデータはそのまま維持
- `accounts` コレクションは新規作成
- 既存の `events` に `account_id` と `event_code` フィールドを追加

### 段階的移行

```
Step 1: accounts コレクション追加 + Firebase Auth 導入
Step 2: events に event_code / account_id 追加
Step 3: webhook の JOIN コマンド対応
Step 4: CURRENT_EVENT_ID 廃止
Step 5: 管理画面のアクセス制御実装
Step 6: Firestore Security Rules 更新
```

---

## 9. 未解決の論点

- [x] 1人のゲストが複数イベントに参加する場合 → **複合キー方式を採用**（下記セクション10参照）
- [x] イベント終了後のデータ保持期間 → **30日間**
- [x] 顧客がイベントを削除した場合のデータ処理 → **顧客はイベントを削除できない。削除は運営者（管理者）のみ**

---

## 10. 複合キー設計（1ゲスト複数イベント対応）

### 概要

1人のゲストが異なるイベントに参加できるよう、`users` コレクションのドキュメントIDを複合キーに変更する。

### ドキュメントID

```
変更前: {line_user_id}
変更後: {line_user_id}_{event_id}
```

例: `U1234567890abcdef_event_abc123`

### メッセージルーティング

| メッセージ種別 | event_id の解決方法 | ドキュメントアクセス |
|--------------|-------------------|-------------------|
| JOIN コマンド | event_code → event_id | `f"{user_id}_{event_id}"` で直接作成 |
| 名前入力 (pending_name) | クエリ: `line_user_id == uid AND join_status == "pending_name"` | クエリ結果から取得 |
| 画像投稿 (registered) | クエリ: `line_user_id == uid AND join_status == "registered"` → 複数時は最新 | クエリ結果から取得 |
| スコアリング | `image_data` の `user_id` + `event_id` から構築 | `f"{user_id}_{event_id}"` で直接アクセス |

### 同一ユーザーが複数アクティブイベントに参加している場合

- 画像投稿時: `created_at` が最新のユーザードキュメントのイベントに紐付ける
- 結婚式の性質上、同時期に2イベント参加はほぼ発生しない

### 影響範囲

| 箇所 | 変更内容 |
|------|---------|
| webhook: `handle_join_event` | ドキュメントID を `f"{user_id}_{event_id}"` に |
| webhook: `handle_text_message` | `line_user_id` + `join_status` でクエリ |
| webhook: `handle_image_message` | `line_user_id` + `join_status == "registered"` でクエリ |
| scoring: `generate_scores_with_vision_api` | `f"{user_id}_{event_id}"` でユーザードキュメントにアクセス |
| frontend: ランキング表示 | ユーザー名取得は `images` の `user_id` + `event_id` で `users` を参照 |
| admin: ユーザー一覧 | `event_id` フィルタで表示（既存パターンと同じ） |

### 必要なインデックス

```
Collection: users
Fields:
  - line_user_id (Ascending)
  - join_status (Ascending)
  - created_at (Descending)
```
