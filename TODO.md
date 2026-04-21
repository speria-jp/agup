# TODO - Implementation Steps

## 1. プロジェクトセットアップ

- [x] `bun init` + package.json 設定
- [x] TypeScript 設定 (tsconfig.json)
- [x] 依存インストール: zod, yaml, @anthropic-ai/sdk
- [x] Linter 設定 (oxlint)
- [x] ディレクトリ構造作成 (src/, tests/)
- [x] テスト環境セットアップ (bun test)

## 2. 型定義・インターフェース

- [x] リソース型定義 (ResourceType, Operation, Plan)
- [x] FileSystem インターフェース (src/fs/interface.ts)
- [x] ApiClient インターフェース (src/api/interface.ts)
- [x] State 型定義 (StateFile, ResourceEntry)

## 3. Parse / Resolve Layer

- [x] Zod スキーマ定義 (src/parse/schema.ts)
  - [x] EnvironmentConfigSchema
  - [x] SkillConfigSchema
  - [x] AgentConfigSchema
  - [x] AgentformConfigSchema (トップレベル)
- [x] 式パーサー (src/parse/expression.ts)
  - [x] EXPR_PATTERN による式検出
  - [x] file 参照パース
  - [x] resource 参照パース
  - [x] 文字列中の複数式対応
- [x] YAML パーサー (src/parse/parser.ts)
  - [x] YAML 読み込み → Zod バリデーション
  - [x] 文字列値内の式をパースして Expr ノード生成
- [x] DAG 構築 (src/parse/dag.ts)
  - [x] リソース参照から依存エッジ抽出
  - [x] トポロジカルソート
  - [x] 循環依存検出

## 4. State 管理

- [x] State ファイル読み込み (src/state/store.ts)
- [x] State ファイル書き込み
- [x] リソースエントリの追加/更新/削除

## 5. Execution Layer

- [x] ハッシュ計算 (src/execute/hash.ts)
  - [x] 設定値の正規化 (キーソート JSON)
  - [x] SHA-256 ハッシュ
  - [x] Skill ディレクトリのハッシュ (全ファイル)
- [x] Planner (src/execute/planner.ts)
  - [x] ${file(...)} 解決
  - [x] State との diff (ハッシュ比較)
  - [x] create Operation 導出 (State にない)
  - [x] update Operation 導出 (ハッシュ不一致)
  - [x] create_version Operation 導出 (Skill ファイル変更)
  - [x] destroy Operation 導出 (YAML にない)
  - [x] Skill display_title 変更 → destroy + create

## 6. Apply Layer

- [x] Applier (src/apply/applier.ts)
  - [x] Operation のトポロジカル順実行
  - [x] ${resource...} の逐次解決
  - [x] Environment create/update/archive
  - [x] Skill create/createVersion/delete
  - [x] Agent create/update/archive (version 付き)
  - [x] State 更新 (各 Operation 完了ごと)
  - [x] Partial apply (失敗時に成功分を保存)

## 7. ApiClient 実装

- [x] Anthropic SDK ラッパー (src/api/sdk-client.ts)
  - [x] Environment API (create, update, archive)
  - [x] Skill API (create, createVersion, delete)
  - [x] Agent API (create, update, archive)
  - [x] リトライ (429, 5xx)

## 8. CLI

- [x] エントリーポイント (src/index.ts)
- [x] `plan` コマンド
  - [x] YAML 読み込み → Parse → Execution → Plan 表示
  - [x] 差分フォーマット出力 (+, ~, ^, -)
- [x] `apply` コマンド
  - [x] plan 表示 → 確認プロンプト → Apply 実行
- [x] `destroy` コマンド
  - [x] State 読み込み → 逆順で全リソース削除
- [x] `state` コマンド
  - [x] State ファイル表示

## 9. テスト

- [x] Parse Layer テスト
  - [x] スキーマバリデーション (P-1 ~ P-8)
  - [x] 式パース (E-1 ~ E-6)
  - [x] DAG (D-1 ~ D-4)
- [x] Execution Layer テスト (mock FileSystem)
  - [x] Plan 生成 (X-1 ~ X-4, X-6, X-7)
  - [x] ハッシュ計算 (H-1 ~ H-4)
  - [x] ファイル解決 (F-1 ~ F-3)
- [x] Apply Layer テスト (mock ApiClient)
  - [x] API 呼び出し (A-1, A-3 ~ A-6, A-8)
  - [x] 参照解決 (R-2 ~ R-3)
  - [x] State 更新 (S-1, S-3 ~ S-5)

## 10. 残タスク

- [x] X-5: Skill display_title 変更テスト追加
- [x] A-2: Environment update テスト追加
- [x] A-7: Agent update テスト追加
- [x] R-1: 既存リソース参照テスト追加
- [x] S-2: Agent update 時の version increment テスト追加
- [x] E2E シナリオテスト (S-1 ~ S-7)
- [ ] リトライテスト (RT-1 ~ RT-3)
