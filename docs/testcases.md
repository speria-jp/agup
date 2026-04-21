# Test Cases

## テスト戦略

| レイヤ | テスト方法 | Mock |
|--------|-----------|------|
| Parse/Resolve | ユニットテスト | なし (純粋関数) |
| Execution | ユニットテスト | FileSystem を mock |
| Apply | 統合テスト | ApiClient を mock |

## Parse / Resolve Layer

### YAML パース + バリデーション

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| P-1 | 全リソース定義の正常パース | environments + skills + agents を含む YAML | Config オブジェクト |
| P-2 | 空のセクション | `environments: {}` | 空の environments map |
| P-3 | セクション省略 | agents のみ定義 | environments, skills は undefined |
| P-4 | Agent の必須フィールド欠落 | name なしの agent | ZodError |
| P-5 | Agent name 長すぎ | 257 文字の name | ZodError |
| P-6 | 不正な networking type | `type: "invalid"` | ZodError |
| P-7 | model がオブジェクト形式 | `{ id: "...", speed: "fast" }` | 正常パース |
| P-8 | metadata の型不正 | `metadata: { key: 123 }` | ZodError |

### 式パース

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| E-1 | リソース参照 | `${skill.search.id}` | `{ type: "resource_ref", resource: "skill", name: "search", attr: "id" }` |
| E-2 | ファイル参照 | `${file('./prompt.md')}` | `{ type: "file_ref", path: "./prompt.md" }` |
| E-3 | 文字列中の式 | `"prefix ${skill.x.id} suffix"` | 前後テキスト + Expr ノード |
| E-4 | 複数式 | `"${file('./a.md')} and ${skill.b.id}"` | 2 つの Expr ノード |
| E-5 | 不正な式 | `${invalid}` | Error |
| E-6 | ハイフン付き名前 | `${skill.my-skill.id}` | 正常パース |

### DAG 構築

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| D-1 | 依存なし | environment + skill のみ | 順不同で実行可能 |
| D-2 | Agent → Skill 依存 | agent が `${skill.x.id}` を参照 | skill.x → agent の順 |
| D-3 | 循環依存 | agent.a → skill.b, skill.b → agent.a | Error: circular dependency |
| D-4 | 複数依存 | agent が複数 skill を参照 | 全 skill → agent の順 |

## Execution Layer

### Plan 生成

| # | ケース | Config + State | 期待 Operations |
|---|--------|---------------|-----------------|
| X-1 | 新規作成 (全リソース) | Config あり, State 空 | create × 3 |
| X-2 | 変更なし | Config と State のハッシュ一致 | operations 空 |
| X-3 | Environment 設定変更 | ハッシュ不一致 | update × 1 |
| X-4 | Skill ファイル変更 | ディレクトリハッシュ不一致 | create_version × 1 |
| X-5 | Skill display_title 変更 | title だけ変更 | destroy + create |
| X-6 | YAML からリソース削除 | State にあるが Config にない | destroy × 1 |
| X-7 | Agent の system が file 参照 | ファイル内容変更 | update × 1 |

### ハッシュ計算

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| H-1 | 同一内容 → 同一ハッシュ | 同じ設定 2 回 | ハッシュ一致 |
| H-2 | フィールド順序変更 → 同一ハッシュ | キー順だけ異なる | ハッシュ一致 |
| H-3 | 値変更 → 異なるハッシュ | 1 フィールド変更 | ハッシュ不一致 |
| H-4 | Skill ディレクトリ | ファイル追加 | ハッシュ不一致 |

### テンプレートマーカー生成

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| T-1 | resource_ref 単独 | `"${skill.search.id}"` | `{ __expr: "resource_ref", ... }` マーカー |
| T-2 | resource_ref + テキスト混在 | `"prefix ${skill.search.id} suffix"` | `{ __expr: "template", parts: [text, expr, text] }` |
| T-3 | 複数 resource_ref 埋め込み | `"${skill.a.id} and ${skill.b.id}"` | `{ __expr: "template", parts: [expr, text, expr] }` |
| T-4 | file_ref + resource_ref 混在 | `"${file('./x.md')} uses ${skill.s.id}"` | file 部分は解決済み文字列、resource_ref 部分は expr パート |
| T-5 | resource_ref なしのテンプレート | `"${file('./a.md')} and ${file('./b.md')}"` | 全て解決済みの plain string (マーカーなし) |

### ${file(...)} 解決

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| F-1 | 正常なファイル参照 | 存在するファイルパス | ファイル内容が展開 |
| F-2 | ファイル不存在 | 存在しないパス | Error |
| F-3 | 相対パス解決 | `./prompts/x.md` | agup.yaml 基準で解決 |

## Apply Layer

### API 呼び出し

| # | ケース | Operation | 期待 API コール |
|---|--------|-----------|----------------|
| A-1 | Environment create | `{ type: "create", resource: "environment", ... }` | `POST /v1/environments` |
| A-2 | Environment update | `{ type: "update", resource: "environment", id: "..." }` | `POST /v1/environments/{id}` |
| A-3 | Skill create | `{ type: "create", resource: "skill", ... }` | `POST /v1/skills` (ファイル付き) |
| A-4 | Skill create_version | `{ type: "create_version", ... }` | `POST /v1/skills/{id}/versions` |
| A-5 | Skill destroy | `{ type: "destroy", resource: "skill", ... }` | `DELETE /v1/skills/{id}` |
| A-6 | Agent create | `{ type: "create", resource: "agent", ... }` | `POST /v1/agents` |
| A-7 | Agent update | `{ type: "update", resource: "agent", ... }` | `POST /v1/agents/{id}` (version 付き) |
| A-8 | Agent archive | `{ type: "destroy", resource: "agent", ... }` | archive API |

### ${resource...} 逐次解決

| # | ケース | 状態 | 期待結果 |
|---|--------|------|----------|
| R-1 | 既存リソースへの参照 | State に ID あり | State から ID 取得 |
| R-2 | 新規リソースへの参照 | 同一 apply 内で先に create | create 結果の ID を使用 |
| R-3 | 解決不能な参照 | 参照先が存在しない | Error |
| R-4 | テンプレート解決 (単一 ref) | `{ __expr: "template", parts: [text, expr, text] }` | 文字列に組み立て |
| R-5 | テンプレート解決 (複数 ref) | parts 内に複数 expr | 全て解決して結合 |
| R-6 | テンプレート内の未解決参照 | expr の参照先が State にない | Error |
| R-7 | ネストした params 内のテンプレート | `{ config: { url: template } }` | 再帰的に解�� |

### State 更新

| # | ケース | 状態 | 期待結果 |
|---|--------|------|----------|
| S-1 | create 成功 | | State にエントリ追加 (id, hash, created_at) |
| S-2 | update 成功 (Agent) | | version インクリメント, hash 更新 |
| S-3 | create_version 成功 | | latest_version 更新, hash 更新 |
| S-4 | destroy 成功 | | State からエントリ削除 |
| S-5 | 途中失敗 (partial apply) | 3 ops 中 2 番目で失敗 | 1 番目の結果は State に保存 |

### リトライ

| # | ケース | API レスポンス | 期待結果 |
|---|--------|---------------|----------|
| RT-1 | 429 | Rate limit | リトライ後に成功 |
| RT-2 | 500 | Server error | 最大 3 回リトライ |
| RT-3 | 400 | Bad request | 即座にエラー停止 |

## シナリオテスト (インテグレーションテスト)

### S-1: 初回デプロイ

前提: State 空、YAML に environment + skill + agent を定義

1. `plan` → 全リソース create として表示
2. `apply` → API 呼び出し (environment → skill → agent 順)
3. State に全リソースの ID, hash が記録される

### S-2: Skill ファイル更新

前提: 全リソース apply 済み。Skill ディレクトリ内の SKILL.md を変更

1. `plan` → `^ skill.xxx (new version)` と表示
2. `apply` → `POST /v1/skills/{id}/versions` 呼び出し
3. State の `latest_version` が更新

### S-3: Agent が新規 Skill を参照

前提: 既存の agent に新しい skill への参照を追加

1. `plan` → skill: create, agent: update
2. `apply` → skill create → 返却 ID → agent update の skill_id に使用
3. State に新 skill 追加、agent の hash 更新

### S-4: リソース削除

前提: YAML から agent の定義を削除

1. `plan` → `- agent.xxx (destroy)` と表示
2. `apply` → archive API 呼び出し
3. State からエントリ削除

### S-5: 全リソース destroy

前提: 全リソース apply 済み

1. `destroy` → Agent → Skill → Environment の順で削除
2. State ファイルがクリア (空の resources)

### S-6: Partial Apply 後のリカバリ

前提: 3 リソースの create 中、2 番目で API エラー

1. `apply` → 1 番目成功、2 番目失敗、3 番目未実行
2. State には 1 番目のみ記録
3. 再度 `plan` → 2 番目 create + 3 番目 create と表示
4. 再度 `apply` → 残り 2 つを create

### S-7: 変更なし

前提: 全リソース apply 済み。YAML 変更なし

1. `plan` → "No changes. Infrastructure is up-to-date." と表示
