# アーキテクチャ概要

## システムアーキテクチャ図

```mermaid
graph TB
    subgraph guests["参列者（LINEユーザー）"]
        User[ユーザー]
    end

    User -->|写真投稿| LINE1[LINE Messaging API]

    LINE1 -->|Webhook| WebhookFunc[Cloud Functions<br/>Webhook Handler]

    WebhookFunc -->|メッセージ受信<br/>ユーザー登録<br/>画像取得| Storage[Cloud Storage<br/>画像保存]
    WebhookFunc --> Firestore[(Firestore<br/>・イベント<br/>・ユーザー情報<br/>・画像メタデータ<br/>・スコア情報)]
    WebhookFunc --> ScoringFunc

    subgraph ScoringFunc[Cloud Functions - Scoring Handler]
        Vision[Vision API<br/>顔検出]
        VertexAI[Vertex AI<br/>gemini-3.5-flash<br/>笑顔判定・テーマ評価]
        AvgHash[Average Hash<br/>類似画像検出]
    end

    Storage -.署名付きURL.-> ScoringFunc
    ScoringFunc -->|スコア保存| Firestore
    ScoringFunc -->|結果返信| LINE2[LINE Messaging API]
    LINE2 -->|スコア通知| User

    subgraph customer["顧客（イベント主催者）"]
        Admin[管理者]
    end

    subgraph frontend["式場担当者（フロントエンド）"]
        Staff[スタッフ]
    end

    Admin --> AdminPanel[Firebase Hosting<br/>管理画面]
    Staff --> RankingPage[Firebase Hosting<br/>ランキング表示]

    AdminPanel --> FirebaseAuth[Firebase Auth]
    Firestore <-->|リアルタイム同期| RankingPage
    Firestore <-->|リアルタイム同期| AdminPanel

    style guests fill:#e1f5ff
    style customer fill:#fff4e1
    style frontend fill:#ffe1f5
    style ScoringFunc fill:#f0f0f0
```

## マルチテナント対応

本システムはマルチテナントアーキテクチャを採用し、単一デプロイで複数のイベントを同時にサポートします。

### イベント参加フロー

1. 顧客（イベント主催者）がFirebase Authでログインし、管理画面でイベントを作成
2. イベント作成時に一意の`event_code`が生成される
3. ゲストはLINE Botに`JOIN {event_code}`を送信してイベントに参加
4. 名前登録後、写真投稿が可能になる

### データ分離

- `users`コレクション: ドキュメントID = `{line_user_id}_{event_id}`（複合キー）
- `images`コレクション: `event_id`フィールドで分離
- `events`コレクション: `account_id`で顧客に紐付け

## コンポーネント説明

### 1. LINE Bot（ユーザーインターフェース）

**役割**: ゲストが写真を投稿するためのインターフェース

- イベント参加（JOINコマンド）
- 名前の登録
- 写真投稿
- スコア結果の受信

**技術**: LINE Messaging API

### 2. Cloud Functions - Webhook Handler

**役割**: LINE Botからのメッセージ受信・処理

**処理フロー**:
1. LINE Webhookリクエストを受信・署名検証
2. イベントタイプを判定（follow/text/image/unsend）
3. JOINコマンド: イベント参加処理
4. テキスト: 名前登録またはコマンド処理
5. 画像: Cloud Storageに保存 → 署名付きURL生成 → Scoring Handlerをトリガー
6. unsend: 画像データ削除（プライバシー保護）

**実装言語**: Python 3.11

**主な機能**:
- Webhook検証（署名チェック）
- マルチテナント対応（JOINフロー）
- 画像ダウンロード・保存
- 署名付きURL生成
- メッセージ取消対応（unsend）

### 3. Cloud Functions - Scoring Handler

**役割**: 画像の分析・スコアリング

**処理フロー**:
1. Cloud Storageから画像取得
2. 並列処理:
   - Cloud Vision APIで顔検出し、Vertex AI (Gemini)で顔ごとの笑顔を判定（顔サイズ係数適用）
   - Vertex AI (Gemini)でテーマ評価
   - Average Hashで同一ユーザーの類似画像判定
3. 総合スコア計算
4. 署名付きURL生成/更新
5. Firestoreにスコア保存（トランザクション）
6. LINE Botにスコア結果を返信

**実装言語**: Python 3.11

**主な機能**:
- 顔検出（Vision API）
- 笑顔判定（Vertex AI gemini-3.5-flash）
- 画像評価（Vertex AI gemini-3.5-flash）
- 類似画像判定（Average Hash、同一ユーザー内のみ）
- 顔サイズ係数による調整
- スコア計算ロジック

### 4. Cloud Vision API

**役割**: 顔検出

**処理内容**:
- 画像から顔を検出
- 顔の位置・サイズ情報を取得（顔サイズ係数計算用、笑顔判定用の切り出し）
- 顔検出の確信度（detection_confidence）を取得

**入力**: 画像バイト列
**出力**: 顔情報（位置、サイズ、確信度など）

Vision APIの感情ラベル（joy_likelihoodなど）は2026-10-15に廃止され、常に`UNKNOWN`を返す。笑顔の判定はVertex AI (Gemini)で行う。

### 5. Vertex AI (Gemini)

**役割**: 顔ごとの笑顔判定、画像のテーマ関連性評価

**使用モデル**: `gemini-3.5-flash`

**処理内容**:
- 笑顔判定: Vision APIで検出した顔を1人ずつ切り出し、笑顔の度合いを5段階で判定
- テーマ評価: 笑顔の質・創造性・ストーリー性を0-100点で評価し、コメントを生成

**入力**: 切り出した顔画像 + プロンプト（笑顔判定）、画像 + プロンプト（テーマ評価）
**出力**: 顔ごとの笑顔の段階（笑顔判定）、スコア + コメント（テーマ評価）。どちらもJSON形式

### 6. Average Hash（自前実装）

**役割**: 類似画像検出

**処理内容**:
1. 画像をグレースケール化
2. 8x8にリサイズ
3. 平均輝度で2値化
4. 64bitハッシュ生成
5. ハミング距離で類似判定（閾値: 8）

**目的**: 連写された写真にペナルティを課す（同一ユーザー内のみ）

### 7. Cloud Storage

**役割**: 画像の永続化ストレージ

**バケット構成**:
```
wedding-smile-images-{project-id}/
└── {event_id}/
    └── original/
        └── {user_id}/
            └── {timestamp}_{image_id}.jpg
```

**セキュリティ**:
- バケットは非公開設定
- 署名付きURLでのみアクセス可能（7日間有効）
- Cloud Storage Lifecycle Policyで自動削除（30日後）

### 8. Firestore

**役割**: メタデータ・スコア・ユーザー情報の保存

**コレクション構成**:
```
accounts/          # 顧客アカウント（Firebase Auth連携）
events/            # イベント情報（event_code, status, account_id）
users/             # ゲスト情報（{line_user_id}_{event_id}）
images/            # 画像メタデータ・スコア・署名付きURL
```

詳細は [database.md](database.md) および `docs/planning/multi-tenant-design.md` を参照

### 9. Firebase Hosting（フロントエンド）

**役割**: 式中のスクリーン表示・管理画面

**画面構成**:
- **ランキング表示** (`index.html`): Firestoreリアルタイムリスナーでトップ3を表示
  - トップ1: 大きく表示（メイン表示）
  - トップ2・3: 小さく並べて表示（サブ表示）
  - スライドショーモード対応
- **管理画面** (`admin.html`): イベント管理、統計ダッシュボード、QRコード生成
- **法的ページ** (`legal.html`): 利用規約、プライバシーポリシー、特定商取引法表記

**実装**:
- Vanilla JavaScript + Firebase SDK
- リアルタイムリスナーでの自動更新
- Firebase Auth（顧客認証）
- レスポンシブデザイン

**デプロイ先**: Firebase Hosting

### 10. スコアリングの定期確認（scoring-canary）

**役割**: 外部APIの仕様変更などで、エラーを出さずに採点がおかしくなったことに気づく

**処理内容**:
- Cloud Schedulerが毎朝9時（日本時間）に `scoring-canary` 関数を呼び出す
- `scoring-canary` は、scoringと同じソースに同梱したテスト写真（LPの `p07_kids3_cake` をJPEGにしたもの）を、本番と同じ `calculate_smile_score` と `evaluate_theme` で採点する
- 次のどれかに当てはまると失敗としてERRORログを出し、Cloud Monitoringのアラートでメールを送る
  - 笑顔判定かAI評価でエラーが出た（フォールバックで点数が出た場合も含む）
  - 笑顔の人数が2人未満（2026-10-24の実測は5人中3人）
  - AI点が70未満（2026-10-24の実測は98）
- Cloud Schedulerのジョブの実行が失敗した場合も、同じアラートでメールを送る
- Firestoreへの書き込みやLINEの送信はしない

**背景**: Vision APIの感情ラベルが2026-10-15に廃止され、エラーを出さずに全員の笑顔点が0になった。テスト投稿をするまで気づけなかった。

## データフロー

### 写真投稿フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant LINE as LINE API
    participant Webhook as Cloud Functions<br/>(Webhook Handler)
    participant Storage as Cloud Storage
    participant Scoring as Cloud Functions<br/>(Scoring Handler)
    participant Vision as Vision API
    participant Vertex as Vertex AI
    participant DB as Firestore

    User->>LINE: 写真送信
    LINE->>Webhook: Webhook POST
    Webhook->>User: ローディング表示
    Webhook->>Storage: 画像保存
    Webhook->>Webhook: 署名付きURL生成
    Webhook->>DB: images作成（pending）
    Webhook->>Scoring: 非同期起動

    par 並列処理
        Scoring->>Vision: 顔検出リクエスト
        Vision-->>Scoring: 顔の位置・サイズ・確信度
        Scoring->>Vertex: 笑顔判定リクエスト（切り出した顔）
        Vertex-->>Scoring: 顔ごとの笑顔の段階
    and
        Scoring->>Vertex: テーマ評価リクエスト
        Vertex-->>Scoring: AI評価スコア
    and
        Scoring->>DB: 同一ユーザーの既存ハッシュ取得
        DB-->>Scoring: ハッシュリスト
        Scoring->>Scoring: Average Hash計算 + 類似判定
    end

    Scoring->>Scoring: 総合スコア計算<br/>(笑顔スコア × AI評価 ÷ 100)<br/>× 類似ペナルティ × 顔サイズ係数
    Scoring->>Scoring: 署名付きURL更新
    Scoring->>DB: スコア保存 + users統計更新
    Scoring->>LINE: 結果返信リクエスト
    LINE->>User: スコア通知
```

### ランキング表示フロー

```mermaid
graph TD
    A[フロントエンド<br/>Firebase Hosting マウント] --> B[Firebase Auth<br/>認証チェック]
    B -->|ランキング画面| C[Firestoreリアルタイム<br/>リスナー設定]
    C --> D[imagesコレクション監視<br/>event_id + status=completed<br/>order by total_score]
    D --> E[Top 100取得]
    E --> F[ユーザー重複除外<br/>Top 3選出]
    F --> G[署名付きURLで画像表示]
    G --> H[画面描画]
    H --> I[トップ1: 大きく表示<br/>トップ2・3: 小さく表示]
    I --> D

    style G fill:#fff4e1
    style H fill:#ffe1e1
```

## スケーラビリティ

### 同時アクセス対策

- **Cloud Functions**: 自動スケーリング（最大1000インスタンス）
- **Firestore**: 読み取り/書き込みの自動シャーディング
- **Cloud Storage**: 無制限のスループット
- **Cloud Vision API / Vertex AI**: リクエストクォータ管理（Geminiは1枚あたり2回呼び出す）

### コスト最適化

- Cloud Functions: 実行時間課金（アイドル時は無料）
- Firestore: 読み取り/書き込み回数課金
- Vision API: 月1000リクエストまで無料
- Vertex AI: 従量課金
- Firebase Hosting: 無料枠内で十分

### 想定規模

- 参列者: 50-100人
- 投稿数: 300-500枚
- ピーク時同時投稿: 50件/分
- 式の期間: 3-4時間

## セキュリティ

### 認証・認可

- LINE Webhook: 署名検証必須
- Cloud Functions: Secret Managerで秘密情報管理
- Firestore: セキュリティルール設定（イベント単位のアクセス制御）
- Firebase Auth: 顧客（イベント主催者）認証

### データ保護

- 画像: 署名付きURL（7日間有効）でのみアクセス可能
- 個人情報: Firestoreの暗号化（デフォルト）
- アクセス制御: IAMロールベース
- unsend対応: ユーザーがメッセージを取り消すと関連データを完全削除
- 自動削除: Cloud Storage Lifecycle Policy（30日後に画像削除）

### プライバシー保護

- 同意タイムスタンプ（consent_timestamp）を名前登録時に記録
- 法的ページ（利用規約、プライバシーポリシー）を提供
- 画像は顔写真（生体データ）として適切に保護

## モニタリング

- **Cloud Logging**: 全ての関数ログ
- **Cloud Monitoring**: メトリクス・アラート（webhook/scoringエラー率監視）
- **Error Reporting**: エラー集約
- **Cloud Trace**: リクエストトレーシング

## 次のステップ

1. [スコアリングアルゴリズム詳細](scoring.md)
2. [データベース設計](database.md)
3. [マルチテナント設計](../planning/multi-tenant-design.md)
4. [API仕様](../api/)
