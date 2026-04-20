# Config Specification

## ファイル

デフォルトパス: `./agup.yaml`

## トップレベル構造

```yaml
environments:
  <logical-name>: ...

skills:
  <logical-name>: ...

agents:
  <logical-name>: ...
```

各セクションは省略可能。`<logical-name>` は state 内でリソースを識別するキー。

## Environment

```yaml
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
```

## Skill

```yaml
skills:
  <logical-name>:
    display_title?: string
    directory: string  # SKILL.md を含むローカルディレクトリパス
```

- `directory` は `agup.yaml` の位置を基準に相対解決
- ディレクトリ内に `SKILL.md` が必須

## Agent

```yaml
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

## 式構文 (`${...}`)

YAML 内の文字列値で `${...}` を使うと「式」として評価される。`${...}` の外はただの文字列として扱われる。

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

式は文字列の一部として埋め込める:

```yaml
system: "You are ${file('./base-prompt.md')}\nAdditional instructions here."
skill_id: "${skill.search.id}"
description: "Uses skill ${skill.search.id} for lookup"
```

`file_ref` は Plan 時に解決される（文字列に展開）。`resource_ref` が文字列内に埋め込まれている場合、Apply 時に解決される。

### パース実装

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

### 式のマーカー表現 (Plan → Apply 間)

Parse/Execution Layer で式を解析した結果は、Apply Layer に渡すために JSON マーカーとして保持する。

#### 単独の resource_ref

```typescript
{ __expr: "resource_ref", resource: "skill", name: "search", attr: "id" }
```

#### 文字列埋め込み (template)

`resource_ref` がテキストと混在する場合、テンプレートマーカーを使用する:

```typescript
{
  __expr: "template",
  parts: [
    { type: "text", value: "Uses skill " },
    { type: "expr", ast: { type: "resource_ref", resource: "skill", name: "search", attr: "id" } },
    { type: "text", value: " for lookup" }
  ]
}
```

Apply 時に各 `expr` パートの AST を評価し、`text` パートと結合して最終文字列を生成する。

#### 将来の拡張: 関数式

AST ノードとして関数呼び出しを導入することで、テンプレート内での変換処理に対応可能:

```typescript
// ${replace(skill.search.id, '-', '_')} の AST 表現
{
  type: "call",
  fn: "replace",
  args: [
    { type: "resource_ref", resource: "skill", name: "search", attr: "id" },
    { type: "literal", value: "-" },
    { type: "literal", value: "_" }
  ]
}
```

テンプレートの `parts[].ast` は任意の式 AST ノードを受け付けるため、関数追加時も Apply 側の evaluator にロジックを足すだけで済む。

## バリデーション

手書き Zod スキーマでバリデーションする。SDK の TypeScript 型と `satisfies` でコンパイル時に整合性を担保。

### Zod スキーマ

```typescript
import { z } from "zod";

const RefOrString = z.string();

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
  tools: z.array(z.unknown()).optional(),
  metadata: z.record(z.string()).optional(),
});

export const AgentformConfigSchema = z.object({
  environments: z.record(EnvironmentConfigSchema).optional(),
  skills: z.record(SkillConfigSchema).optional(),
  agents: z.record(AgentConfigSchema).optional(),
});
```

### SDK 型との整合性チェック

```typescript
import type Anthropic from "@anthropic-ai/sdk";

type AgentCreateParams = Parameters<Anthropic["beta"]["agents"]["create"]>[0];
type AgentFromConfig = Omit<z.infer<typeof AgentConfigSchema>, "system"> & { system: string };

const _typeCheck: AgentCreateParams = {} as AgentFromConfig;
```
