# 実装計画・優先度

このドキュメントは、実装の優先度とフェーズを管理します。

**最終更新**: 2025-11-18

---

## Phase 1: MVP（最小実装）

結婚式で最低限動作させるために必要な機能

### バックエンド

#### ✅ 必須機能

**Webhook Function**
- [x] LINE署名検証
- [x] Follow Event処理（友だち追加時の案内）
- [x] Text Message処理（ユーザー登録）
- [x] Image Message処理（画像受信・保存・Scoring起動）
- [x] ローディングメッセージ送信

**Scoring Function**
- [x] Cloud Storageから画像取得
- [x] Vision API で笑顔検出（**逐次処理**）
- [x] Vertex AI (Gemini) でテーマ評価（**シンプルプロンプト**）
- [x] Average Hash 計算
- [x] 類似判定（**同一ユーザーの過去画像のみ**）
- [x] スコア計算（公式: (smile × ai / 100) × penalty）
- [x] Firestore保存（image, user統計更新）
- [x] LINE Bot にスコア返信

**データベース（Firestore）**
- [x] usersコレクション
  - name, line_user_id, created_at
  - **total_uploads, best_score を実装**（統計として活用）
- [x] imagesコレクション
  - 全フィールド実装
- [x] rankingコレクション（オプション: 後で検討）

**インフラ**
- [x] Cloud Functions デプロイ（Webhook, Scoring）
- [x] Cloud Storage バケット作成
- [x] Firestore初期化・インデックス作成
- [x] Secret Manager 設定（LINE認証情報）
- [x] 環境変数設定（.env）

---

### フロントエンド

#### ✅ 必須機能

**ランキング表示画面（Next.js）**
- [x] Firestoreリアルタイムリスナー（imagesコレクション監視）
- [x] Top 100取得 → ユーザー重複除外 → Top 3選出
- [x] UI実装
  - トップ1: 大きく表示
  - トップ2・3: 小さく並べて表示
- [x] Cloud Run デプロイ

---

### ドキュメント・設定

- [x] 環境変数テンプレート（.env.example）
- [x] .gitignore
- [x] README.md
- [x] 各種設計ドキュメント

---

## Phase 2: 最適化・改善

MVP動作確認後、時間があれば実装する機能

### パフォーマンス最適化

#### ⏳ 後回し（Phase 2）

**並列処理の実装**
- [ ] Vision API と Vertex AI を並列実行
- [ ] `asyncio.gather()` を使用
- **効果**: 処理時間 2-3秒短縮（15秒 → 12-13秒）
- **実装難易度**: 中
- **優先度**: 中

```python
# Phase 2で実装
async def score_image_parallel(image_bytes):
    smile_task = asyncio.create_task(calculate_smile_score(image_bytes))
    ai_task = asyncio.create_task(evaluate_theme(image_bytes))
    smile_result, ai_result = await asyncio.gather(smile_task, ai_task)
```

**類似判定の全体チェック**
- [ ] 同一ユーザーだけでなく、全画像との類似判定
- **効果**: 他人の画像との類似もペナルティ可能
- **懸念**: Firestore読み取り回数増加（コスト増）
- **実装難易度**: 低
- **優先度**: 低

---

### LINE Bot機能拡張

#### 🔵 優先度: 中（時間があれば実装）

**ヘルプコマンド**
- [ ] 「ヘルプ」「help」「使い方」コマンド
- [ ] Flex Messageで分かりやすく表示
- **代替案**: 受付での説明書で代用可能
- **実装難易度**: 低
- **優先度**: 中

**ランキングコマンド**
- [ ] 「ランキング」「順位」コマンド
- [ ] 現在のTop 3をLINEメッセージで返信
- **代替案**: スクリーンを見てもらう
- **実装難易度**: 低
- **優先度**: 中

#### 🔴 優先度: 低（余裕があれば）

**リッチメニュー**
- [ ] リッチメニュー画像作成（2500×843px）
- [ ] LINE Messaging API で設定
- **効果**: UX向上
- **実装難易度**: 中（画像デザイン含む）
- **優先度**: 低

---

### AI・スコアリング改善

#### ⏳ 後回し（Phase 2）

**Vertex AI プロンプト詳細化**
- [ ] シンプルプロンプト → 詳細プロンプトに変更
- [ ] 評価基準の明確化（自然さ30点、幸福度40点、調和30点）
- **効果**: 評価の一貫性向上
- **懸念**: トークン数増加（コスト増）
- **実装難易度**: 低（プロンプト変更のみ）
- **優先度**: 低

**現在（Phase 1）:**
```python
SIMPLE_PROMPT = """
この写真を結婚式の笑顔写真として0-100点で評価してください。
評価基準: 笑顔の自然さと幸福度、結婚式らしい雰囲気
JSON形式で返してください: {"score": 85, "comment": "素晴らしい笑顔です"}
"""
```

**Phase 2:**
```python
DETAILED_PROMPT = """
あなたは結婚式写真の専門家です...
## 評価基準（100点満点）
1. 自然さ（30点）...
2. 幸福度（40点）...
3. 周囲との調和（30点）...
"""
```

---

### エラーハンドリング強化

#### ⏳ 後回し（Phase 2）

**詳細なエラー分類と対応**
- [ ] API別のリトライロジック
- [ ] タイムアウト処理
- [ ] フォールバック処理（APIエラー時の代替スコア）
- **効果**: 本番での安定性向上
- **実装難易度**: 中
- **優先度**: 中

**現在（Phase 1）:**
```python
# 最小限のエラーハンドリング
try:
    score = score_image(image_id, user_id, image_bytes)
except Exception as e:
    logging.error(f"Scoring failed: {e}")
    send_error_message(user_id, "エラーが発生しました。")
```

**Phase 2:**
```python
# 詳細なエラーハンドリング
try:
    score = score_image(...)
except VisionAPIError as e:
    logging.error(f"Vision API error: {e}")
    retry_with_backoff()
except VertexAIError as e:
    logging.error(f"Vertex AI error: {e}")
    # フォールバック: AI評価なしでスコア算出
    fallback_score()
```

---

## Phase 3: 発展機能（余裕があれば）

本番運用後、フィードバックを得てから検討

### 統計・分析機能

- [ ] 投稿数ランキング（total_uploadsを活用）
- [ ] 時間帯別投稿グラフ
- [ ] 平均スコア、中央値など統計情報
- [ ] ユーザー別スコア遷移

### 管理機能

- [ ] 管理者用ダッシュボード（Next.js）
- [ ] 不適切画像の削除機能
- [ ] スコア再計算機能

### データエクスポート

- [ ] 全画像のZIPダウンロード
- [ ] スコアCSVエクスポート
- [ ] 結婚式終了後のアーカイブ機能

---

## 実装チェックリスト（Phase 1 MVP）

### 事前準備
- [ ] GCPプロジェクト作成
- [ ] 必要なAPI有効化
- [ ] LINE Botチャネル作成
- [ ] 環境変数設定（.env）

### バックエンド実装
- [ ] Webhook Function実装
  - [ ] 署名検証
  - [ ] Follow Event
  - [ ] Text Message（ユーザー登録）
  - [ ] Image Message（画像保存）
- [ ] Scoring Function実装（**逐次処理版**）
  - [ ] Vision API統合
  - [ ] Vertex AI統合（**シンプルプロンプト**）
  - [ ] Average Hash
  - [ ] 類似判定（**同一ユーザーのみ**）
  - [ ] スコア計算
  - [ ] ユーザー統計更新（**total_uploads, best_score**）
- [ ] Cloud Functionsデプロイ
- [ ] 動作確認（ローカル + 本番）

### フロントエンド実装
- [ ] Next.jsプロジェクト作成
- [ ] Firestore統合
- [ ] ランキング表示UI実装
  - [ ] トップ1（大）
  - [ ] トップ2・3（小）
- [ ] Cloud Runデプロイ
- [ ] 動作確認

### テスト
- [ ] ユーザー登録テスト
- [ ] 画像投稿テスト（笑顔検出）
- [ ] スコアリングテスト
- [ ] 類似画像テスト
- [ ] ランキング表示テスト
- [ ] 負荷テスト（50件/分）

### ドキュメント
- [ ] セットアップ手順確認
- [ ] 受付用説明書作成（Canva等）
- [ ] QRコード準備

---

## 判断基準

### Phase 1 → Phase 2 に進む条件
- Phase 1の全機能が動作確認済み
- 本番テスト（模擬結婚式）で問題なし
- 結婚式まで **2週間以上** の余裕がある

### Phase 2 をスキップする条件
- Phase 1で十分な品質
- 結婚式まで **2週間未満**
- パフォーマンスに問題なし（15秒以内で返信）

---

## 備考

### Phase 1 で意図的にシンプルにした箇所

| 項目 | Phase 1（シンプル版） | Phase 2（改善版） | 理由 |
|------|---------------------|------------------|------|
| 処理方式 | 逐次処理 | 並列処理 | 実装が簡単、デバッグしやすい |
| 類似判定 | 同一ユーザーのみ | 全画像 | Firestore読み取り削減 |
| AIプロンプト | シンプル | 詳細 | コスト削減、レスポンス速度 |
| エラー処理 | 最小限 | 詳細 | 実装速度優先 |

### 実装時の注意点

1. **Phase 1を完璧にする**
   - Phase 2より、Phase 1の品質を優先
   - バグのないMVPが最重要

2. **Phase 2は欲張らない**
   - 時間がなければPhase 1のみで本番OK
   - 結婚式後にPhase 2実装も可能

3. **本番は一度きり**
   - Phase 1で十分テストする
   - 新機能は本番直前に追加しない

---

## 次のステップ

1. Phase 1の実装開始
2. 各機能を実装しながらこのドキュメントを更新
3. Phase 1完了後、Phase 2の要否を判断
