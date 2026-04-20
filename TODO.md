# TODO - Implementation Steps

## 1. プロジェクトセットアップ

- [ ] `bun init` + package.json 設定
- [ ] TypeScript 設定 (tsconfig.json)
- [ ] 依存インストール: zod, yaml, @anthropic-ai/sdk
- [ ] Linter 設定 (oxlint)
- [ ] ディレクトリ構造作成 (src/, tests/)
- [ ] テスト環境セットアップ (bun test)

## 2. 型定義・インターフェース

- [ ] リソース型定義 (ResourceType, Operation, Plan)
- [ ] FileSystem インターフェース (src/fs/interface.ts)
- [ ] ApiClient インターフェース (src/api/interface.ts)
- [ ] State 型定義 (StateFile, ResourceEntry)

## 3. Parse / Resolve Layer

- [ ] Zod スキーマ定義 (src/parse/schema.ts)
  - [ ] EnvironmentConfigSchema
  - [ ] SkillConfigSchema
  - [ ] AgentConfigSchema
  - [ ] AgentformConfigSchema (トップレベル)
- [ ] 式パーサー (src/parse/expression.ts)
  - [ ] EXPR_PATTERN による式検出
  - [ ] file 参照パース
  - [ ] resource 参照パース
  - [ ] 文字列中の複数式対応
- [ ] YAML パーサー (src/parse/parser.ts)
  - [ ] YAML 読み込み → Zod バリデーション
  - [ ] 文字列値内の式をパースして Expr ノード生成
- [ ] DAG 構築 (src/parse/dag.ts)
  - [ ] リソース参照から依存エッジ抽出
  - [ ] トポロジカルソート
  - [ ] 循環依存検出

## 4. State 管理

- [ ] State ファイル読み込み (src/state/store.ts)
- [ ] State ファイル書き込み
- [ ] リソースエントリの追加/更新/削除

## 5. Execution Layer

- [ ] ハッシュ計算 (src/execute/hash.ts)
  - [ ] 設定値の正規化 (キーソート JSON)
  - [ ] SHA-256 ハッシュ
  - [ ] Skill ディレクトリのハッシュ (全ファイル)
- [ ] Planner (src/execute/planner.ts)
  - [ ] ${file(...)} 解決
  - [ ] State との diff (ハッシュ比較)
  - [ ] create Operation 導出 (State にない)
  - [ ] update Operation 導出 (ハッシュ不一致)
  - [ ] create_version Operation 導出 (Skill ファイル変更)
  - [ ] destroy Operation 導出 (YAML にない)
  - [ ] Skill display_title 変更 → destroy + create

## 6. Apply Layer

- [ ] Applier (src/apply/applier.ts)
  - [ ] Operation のトポロジカル順実行
  - [ ] ${resource...} の逐次解決
  - [ ] Environment create/update/archive
  - [ ] Skill create/createVersion/delete
  - [ ] Agent create/update/archive (version 付き)
  - [ ] State 更新 (各 Operation 完了ごと)
  - [ ] Partial apply (失敗時に成功分を保存)

## 7. ApiClient 実装

- [ ] Anthropic SDK ラッパー (src/api/sdk-client.ts)
  - [ ] Environment API (create, update, archive)
  - [ ] Skill API (create, createVersion, delete)
  - [ ] Agent API (create, update, archive)
  - [ ] リトライ (429, 5xx)

## 8. CLI

- [ ] エントリーポイント (src/index.ts)
- [ ] `plan` コマンド
  - [ ] YAML 読み込み → Parse → Execution → Plan 表示
  - [ ] 差分フォーマット出力 (+, ~, ^, -)
- [ ] `apply` コマンド
  - [ ] plan 表示 → 確認プロンプト → Apply 実行
- [ ] `destroy` コマンド
  - [ ] State 読み込み → 逆順で全リソース削除
- [ ] `state` コマンド
  - [ ] State ファイル表示

## 9. テスト

- [ ] Parse Layer テスト
  - [ ] スキーマバリデーション (P-1 ~ P-8)
  - [ ] 式パース (E-1 ~ E-6)
  - [ ] DAG (D-1 ~ D-4)
- [ ] Execution Layer テスト (mock FileSystem)
  - [ ] Plan 生成 (X-1 ~ X-7)
  - [ ] ハッシュ計算 (H-1 ~ H-4)
  - [ ] ファイル解決 (F-1 ~ F-3)
- [ ] Apply Layer テスト (mock ApiClient)
  - [ ] API 呼び出し (A-1 ~ A-8)
  - [ ] 参照解決 (R-1 ~ R-3)
  - [ ] State 更新 (S-1 ~ S-5)
