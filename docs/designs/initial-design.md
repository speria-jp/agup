# agup - Initial Design

## Overview

agup は Claude Managed Agent のリソース（Agent, Skill, Environment）を宣言的に管理する CLI ツール。
Terraform のような plan/apply のワークフローで、YAML ファイルに定義されたリソースを API と同期する。

## Positioning

```
agup (インフラ管理)          プロダクトコード (アプリケーション層)
┌─────────────────────────┐      ┌──────────────────────────────────┐
│ YAML定義 → plan → apply │      │ session.create({                 │
│                         │      │   agent_id: "agent_xxx",         │
│ state.json に ID 記録    │─────▶│   environment_id: "env_yyy"      │
│                         │      │ })                               │
└─────────────────────────┘      └──────────────────────────────────┘
```

agup 自体は session を作成しない。リソースの存在とその設定を管理するだけ。
プロダクト側のコードが state から ID を参照し、実際のセッションを起動する。

## Tech Stack

- Runtime: Bun
- Language: TypeScript
- Config format: YAML
- State: ローカル JSON ファイル (`agup.state.json`)
- API client: `@anthropic-ai/sdk`

## CLI Commands

```bash
agup plan      # YAML 定義と現在の state を比較し、差分を表示（YAML から消えたリソースは destroy として表示）
agup apply     # plan の内容を実行して API に反映、state を更新（create / update / destroy 全て含む）
agup destroy   # state にある全リソースを削除
agup state     # 現在の state を表示
```

## Managed Resources

### Environment (`/v1/environments`)

実行環境の定義。Agent から直接参照されないが、session 起動時に指定される。

| Field | Type | Description |
|-------|------|-------------|
| name | string | 環境名 |
| description | string? | 説明 |
| config.type | "cloud" | 環境タイプ |
| config.networking | object | ネットワークポリシー (unrestricted / limited) |
| config.packages | object | pip, npm, apt, cargo, gem, go パッケージ |
| metadata | Record<string, string> | 任意の key-value |

API operations: create / update / archive

- Update: `POST /v1/environments/{environment_id}` — 楽観的ロック (version) なし。omit したフィールドは既存値保持（パッチセマンティクス）。

### Skill (`/v1/skills`)

Agent に付与するスキル。SKILL.md を含むディレクトリをアップロードして作成する。

| Field | Type | Description |
|-------|------|-------------|
| display_title | string? | 表示名 |
| files | File[] | SKILL.md を含むディレクトリ |

API operations: create / create version / delete

- update API は存在しない。`display_title` の変更は Execution Layer が destroy + create の 2 Operation に展開する。
- ファイル内容の変更は `update` Operation として表現し、Apply Layer が create version API にマッピングする。
- バージョン管理: ファイル内容のハッシュを state に記録し、変更があれば新バージョンを作成する。
- delete 時のレスポンス: `{ id, type: "skill_deleted" }`

### Agent (`/v1/agents`)

Agent の本体。Skill や MCP Server を参照する。

| Field | Type | Description |
|-------|------|-------------|
| name | string | Agent 名 (1-256 chars) |
| description | string? | 説明 (max 2048 chars) |
| model | string or {id, speed?} | モデル設定 |
| system | string | System prompt (max 100K chars) |
| mcp_servers | object[] | MCP サーバー定義 (name, type, url) |
| skills | object[] | Skill 参照 (type, skill_id, version?) |
| tools | object[] | ツール設定 (agent_toolset / mcp_toolset / custom) |
| metadata | Record<string, string> | 任意の key-value |

API operations: create / update / archive

Update 時に `version` フィールド（楽観的ロック）が必須。state から現在の version を取得して送信する。

## YAML Schema

```yaml
# agup.yaml

environments:
  <logical-name>:
    name: string
    description?: string
    config:
      type: cloud
      networking:
        type: unrestricted | limited
        # limited の場合:
        allowed_hosts?: string[]
        allow_mcp_servers?: boolean
        allow_package_managers?: boolean
      packages?:
        pip?: string[]
        npm?: string[]
        apt?: string[]
        cargo?: string[]
        gem?: string[]
        go?: string[]
    metadata?: Record<string, string>

skills:
  <logical-name>:
    display_title?: string
    directory: string  # SKILL.md を含むローカルディレクトリパス

agents:
  <logical-name>:
    name: string
    description?: string
    model: string | { id: string, speed?: "standard" | "fast" }
    system: string  # 文字列直書き or ${file('./path')} でファイル参照
    mcp_servers?:
      - name: string
        url: string
    skills?:
      - type: anthropic | custom
        skill_id: string | ${skill.<logical-name>.id}
        version?: string
    tools?:
      - type: agent_toolset_20260401
        default_config?: { enabled?: bool, permission_policy?: always_allow | always_ask }
        configs?:
          - name: bash | edit | read | write | glob | grep | web_fetch | web_search
            enabled?: boolean
            permission_policy?: always_allow | always_ask
      - type: mcp_toolset
        mcp_server_name: string
        default_config?: { enabled?: bool, permission_policy?: always_allow | always_ask }
        configs?:
          - name: string
            enabled?: boolean
            permission_policy?: always_allow | always_ask
      - type: custom
        name: string
        description: string
        input_schema?: object
    metadata?: Record<string, string>
```

## Expression Syntax (式構文)

YAML 内の文字列値で `${...}` を使うと「式」として評価される。
`${...}` の外はすべてただの文字列として扱われる。

### 式の種類

| 構文 | 意味 | 例 |
|------|------|-----|
| `${<type>.<name>.<attr>}` | リソース参照 | `${skill.search-knowledge.id}` |
| `${file('<path>')}` | ファイル内容を文字列として注入 | `${file('./prompts/support.md')}` |

### リソース参照

```
${skill.search-knowledge.id}        → Skill の ID
${environment.python-data.id}       → Environment の ID
${agent.support-bot.id}             → Agent の ID
```

### ファイル参照

```yaml
agents:
  support-bot:
    system: ${file('./prompts/support.md')}
```

- パスは `agup.yaml` の位置を基準に相対解決
- ファイル内容がそのまま文字列値として展開される

### 文字列中への埋め込み

式は文字列の一部として埋め込める：

```yaml
system: "You are ${file('./base-prompt.md')}\nAdditional instructions here."
```

### 解決タイミング

- `${file(...)}`: パース時に即座に解決（ファイル読み込み）
- `${resource.name.attr}`:
  - `plan` 時: state に既に ID がある場合はそこから解決。未作成の場合は `(pending)` と表示。
  - `apply` 時: DAG をトポロジカルソートし、依存先から順に作成。作成後に ID を state に記録し、後続リソースの参照を解決。

### 循環依存

トポロジカルソート時に循環を検出したらエラー終了。

### 実装

```typescript
const EXPR_PATTERN = /\$\{(.+?)\}/g;

type Expr =
  | { type: "resource_ref"; resource: string; name: string; attr: string }
  | { type: "file_ref"; path: string };

function parseExpr(raw: string): Expr {
  const fileMatch = raw.match(/^file\(['"](.+?)['"]\)$/);
  if (fileMatch) return { type: "file_ref", path: fileMatch[1] };

  const refMatch = raw.match(/^(\w[\w-]*)\.(\w[\w-]*)\.(\w+)$/);
  if (refMatch) return { type: "resource_ref", resource: refMatch[1], name: refMatch[2], attr: refMatch[3] };

  throw new Error(`Invalid expression: \${${raw}}`);
}
```

## State File

```jsonc
// agup.state.json
{
  "version": 1,
  "resources": {
    "environment.python-data": {
      "type": "environment",
      "logical_name": "python-data",
      "id": "env_01ABC...",
      "created_at": "2026-04-20T...",
      "last_applied_hash": "sha256:..."
    },
    "skill.search-knowledge": {
      "type": "skill",
      "logical_name": "search-knowledge",
      "id": "skill_01XYZ...",
      "latest_version": "1759178010641129",
      "created_at": "2026-04-20T...",
      "last_applied_hash": "sha256:..."  // ディレクトリ内容のハッシュ
    },
    "agent.support-bot": {
      "type": "agent",
      "logical_name": "support-bot",
      "id": "agent_01DEF...",
      "version": 3,
      "created_at": "2026-04-20T...",
      "last_applied_hash": "sha256:..."
    }
  }
}
```

- `last_applied_hash`: YAML 定義（+ 参照されるファイル内容）のハッシュ。変更検知に使用。
- `version` (Agent): API の楽観的ロック用バージョン番号。update 時に送信。

## Validation Strategy

手書き Zod スキーマ + SDK 型とのコンパイル時整合性チェック。

### 方針

- YAML バリデーションには Zod を使用
- agup 固有フィールド（`directory`, ファイルパス参照, `${...}` 式）を統一的に扱う
- SDK の TypeScript 型と `satisfies` で整合性をコンパイル時に担保
- OpenAPI spec からの自動生成は、リソースタイプが増えた時に再検討

### 理由

- SDK は Zod スキーマをエクスポートしていない（TypeScript 型のみ）
- OpenAPI spec は存在するが URL が不安定（ハッシュ入り GCS URL）
- リソース数が 3 で規模が小さく、手書きで十分管理可能
- agup 固有の拡張（ファイル参照、参照式）を自然に組み込める

### 実装イメージ

```typescript
import { z } from "zod";

const RefOrString = z.string(); // ${...} 参照式も文字列として受け取る

const EnvironmentConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  config: z.object({
    type: z.literal("cloud"),
    networking: z.discriminatedUnion("type", [
      z.object({ type: z.literal("unrestricted") }),
      z.object({
        type: z.literal("limited"),
        allowed_hosts: z.array(z.string()).optional(),
        allow_mcp_servers: z.boolean().optional(),
        allow_package_managers: z.boolean().optional(),
      }),
    ]).optional(),
    packages: z.object({
      pip: z.array(z.string()).optional(),
      npm: z.array(z.string()).optional(),
      apt: z.array(z.string()).optional(),
      cargo: z.array(z.string()).optional(),
      gem: z.array(z.string()).optional(),
      go: z.array(z.string()).optional(),
    }).optional(),
  }),
  metadata: z.record(z.string()).optional(),
});

const SkillConfigSchema = z.object({
  display_title: z.string().optional(),
  directory: z.string(),
});

const AgentConfigSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  model: z.union([
    z.string(),
    z.object({ id: z.string(), speed: z.enum(["standard", "fast"]).optional() }),
  ]),
  system: z.string(),
  mcp_servers: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
  })).optional(),
  skills: z.array(z.object({
    type: z.enum(["anthropic", "custom"]),
    skill_id: RefOrString,
    version: z.string().optional(),
  })).optional(),
  tools: z.array(z.unknown()).optional(), // tools は構造が複雑なので段階的に厳密化
  metadata: z.record(z.string()).optional(),
});

export const AgentformConfigSchema = z.object({
  environments: z.record(EnvironmentConfigSchema).optional(),
  skills: z.record(SkillConfigSchema).optional(),
  agents: z.record(AgentConfigSchema).optional(),
});
```

### SDK 型との整合性チェック（コンパイル時）

```typescript
import type Anthropic from "@anthropic-ai/sdk";

// API に送信する前の変換後の型が SDK のパラメータ型に代入可能かチェック
type AgentCreateParams = Parameters<Anthropic["beta"]["agents"]["create"]>[0];
type AgentFromConfig = Omit<z.infer<typeof AgentConfigSchema>, "system"> & { system: string };

// コンパイルエラーで不整合を検出
const _typeCheck: AgentCreateParams = {} as AgentFromConfig; // 型レベルアサーション
```

## Dependency Graph & Apply Order

```
1. Environment (依存なし)
2. Skill (依存なし)
3. Agent (→ Skill に依存する可能性あり)
```

apply 時は DAG をトポロジカルソートして実行順を決定する。
同じ階層のリソース（例: 複数の Environment）は並列に作成可能。

## Change Detection (差分検知)

1. YAML 定義を読み込み、各リソースの設定内容をハッシュ化
2. State 内の `last_applied_hash` と比較
3. 差分があれば plan に含める

### 特殊ケース

- **Skill**: ディレクトリ内の全ファイルをハッシュ対象にする。変更があれば新バージョン作成。
- **Agent の system prompt が外部ファイル参照**: ファイル内容もハッシュに含める。
- **State にあるが YAML にない**: destroy 対象として表示。

## Plan Output Example

```
agup plan

~ environment.python-data (update)
    networking.allowed_hosts: ["api.example.com"] → ["api.example.com", "db.example.com"]

+ skill.data-processor (create)
    display_title: "Data Processor"
    directory: ./skills/data-processor/

~ skill.search-knowledge (update)
    files changed: SKILL.md, utils.py

~ agent.support-bot (update)
    skills: added skill.data-processor

- agent.old-bot (destroy)

Plan: 1 to create, 2 to update, 1 to destroy.
```

## File Path Resolution

- `${file('./path')}`: ファイル内容を文字列として注入。パスは `agup.yaml` の位置を基準に相対解決。
- `directory` フィールド (Skill): ディレクトリパスを文字列として指定。`agup.yaml` の位置を基準に相対解決し、中のファイルをアップロード。

## Error Handling

- API エラー: リトライ（429, 5xx）、それ以外は即座にエラー表示して停止
- 部分適用: apply 途中で失敗した場合、成功した分の state は保存する（partial apply）
- State 不整合: `agup state refresh` で API から最新状態を取得して state を再構築

## Internal Architecture (Layering)

テスタビリティと責務分離のため、3層に分離する。IO はインターフェース経由で注入し、mock 差し替え可能にする。

```
┌─────────────────────────────────────────────────────────────┐
│  Parse / Resolve Layer (Pure・決定的)                         │
│                                                              │
│  1. YAML パース + Zod バリデーション                            │
│  2. ${...} 式のパース → Expr ノード生成（未解決のまま保持）       │
│  3. Expr から依存グラフ (DAG) 構築                             │
│                                                              │
│  入力: YAML 文字列                                            │
│  出力: Config (バリデーション済み、Expr ノード含む、DAG 付き)     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Execution Layer (IO: FileSystem)                            │
│                                                              │
│  1. ${file(...)} を解決（FileSystem 経由でファイル読み込み）      │
│  2. Skill ディレクトリのファイル読み込み                         │
│  3. ハッシュ計算（設定内容 + ファイル内容）                       │
│  4. State との diff → Operation 導出                          │
│                                                              │
│  入力: Config + State + FileSystem                            │
│  出力: Plan (完全に値が確定した Operation リスト)                │
│        ※ ${resource...} のみ未解決（apply 時に逐次解決）        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Apply Layer (IO: ApiClient)                                 │
│                                                              │
│  1. Operation をトポロジカル順に実行                            │
│  2. ${resource...} を逐次解決（create 結果の ID を後続に伝播）  │
│  3. API 呼び出し (ApiClient 経由)                             │
│  4. State 更新・書き込み                                      │
│                                                              │
│  入力: Plan + ApiClient + State                               │
│  出力: 更新された State                                       │
└─────────────────────────────────────────────────────────────┘
```

### CLI コマンドと層の対応

```
agup plan  → Parse/Resolve + Execution → Plan を表示
agup apply → Parse/Resolve + Execution + Apply → State 更新
```

### 境界: Plan データ構造

Plan は Execution 層の出力であり、Apply 層への入力。
`${file(...)}` は解決済み。`${resource...}` は未解決の場合がある（新規作成リソースへの参照）。

```typescript
type ResourceType = "environment" | "skill" | "agent";

type ResourceRef = { __expr: "resource_ref"; resource: string; name: string; attr: string };

type Operation =
  | { type: "create"; resource: ResourceType; name: string; params: Record<string, unknown> }
  | { type: "update"; resource: ResourceType; name: string; id: string; params: Record<string, unknown> }
  | { type: "destroy"; resource: ResourceType; name: string; id: string };

type Plan = {
  operations: Operation[];  // トポロジカルソート済み
};
```

params 内に `ResourceRef` が含まれる場合、Apply 層が実行時に解決する。

### DI インターフェース

```typescript
interface FileSystem {
  readFile(path: string): Promise<string>;
  readDirectory(path: string): Promise<File[]>;
}

interface ApiClient {
  agents: {
    create(params: AgentCreateParams): Promise<Agent>;
    update(id: string, params: AgentUpdateParams): Promise<Agent>;
    archive(id: string): Promise<void>;
  };
  skills: {
    create(params: SkillCreateParams): Promise<Skill>;
    createVersion(skillId: string, params: SkillVersionCreateParams): Promise<SkillVersion>;
    delete(skillId: string): Promise<void>;
  };
  environments: {
    create(params: EnvironmentCreateParams): Promise<Environment>;
    update(id: string, params: EnvironmentUpdateParams): Promise<Environment>;
    archive(id: string): Promise<void>;
  };
}
```

### テスト戦略

| レイヤ | テスト方法 | Mock |
|--------|-----------|------|
| Parse/Resolve | ユニットテスト | なし (純粋関数、YAML 文字列を入力) |
| Execution | ユニットテスト | FileSystem を mock |
| Apply | 統合テスト | ApiClient を mock |
| ApiClient 実装 | E2E テスト | 実 API (staging) |

## Project Structure

```
agup/
├── src/
│   ├── index.ts              # CLI エントリーポイント
│   ├── parse/
│   │   ├── parser.ts         # YAML パース + 式パース → Config + Expr ノード
│   │   ├── schema.ts         # Zod スキーマ定義 & バリデーション
│   │   ├── expression.ts     # ${...} 式のパーサー
│   │   └── dag.ts            # 依存グラフ構築 & トポロジカルソート
│   ├── execute/
│   │   ├── planner.ts        # ${file(...)} 解決 + ハッシュ計算 + diff → Plan 生成
│   │   └── hash.ts           # ハッシュ計算 (設定内容 + ファイル内容)
│   ├── apply/
│   │   └── applier.ts        # Plan 実行 (${resource...} 解決 + API 呼び出し + State 更新)
│   ├── api/
│   │   ├── interface.ts      # ApiClient インターフェース定義
│   │   └── sdk-client.ts     # Anthropic SDK による ApiClient 実装
│   ├── state/
│   │   └── store.ts          # State ファイル読み書き
│   └── fs/
│       └── interface.ts      # FileSystem インターフェース & 実装
├── tests/
│   ├── parse/                # パース・バリデーション・DAG のテスト
│   ├── execute/              # Plan 生成のテスト (mock FileSystem)
│   └── apply/                # Apply のテスト (mock ApiClient)
├── agup.yaml            # (example)
├── package.json
├── tsconfig.json
└── README.md
```

## MVP Scope

Phase 1:
- [ ] YAML パース + バリデーション
- [ ] State ファイル管理
- [ ] 参照解決 (${...})
- [ ] Environment create/update
- [ ] Skill create/version create
- [ ] Agent create/update
- [ ] `plan` コマンド
- [ ] `apply` コマンド

Phase 2:
- [ ] `destroy` のリソース指定オプション（例: `agup destroy agent.support-bot`）
- [ ] `state refresh` コマンド
- [ ] 並列実行（同階層リソース）
- [ ] dry-run モード
- [ ] CI/CD 向け non-interactive モード
- [ ] State ファイルのロック（concurrent access 保護）
