# Config Specification

## File

Default path: `./agup.yaml`

## Top-level Structure

```yaml
environments:
  <logical-name>: ...

skills:
  <logical-name>: ...

agents:
  <logical-name>: ...
```

All sections are optional. `<logical-name>` is the key that identifies a resource within state.

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
        # When limited:
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
    directory: string  # Local directory path containing SKILL.md
```

- `directory` is resolved relative to the location of `agup.yaml`
- The directory must contain a `SKILL.md` file

## Agent

```yaml
agents:
  <logical-name>:
    name: string
    description?: string
    model: string | { id: string, speed?: "standard" | "fast" }
    system: string  # Inline string or file reference via ${file('./path')}
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

## Expression Syntax (`${...}`)

`${...}` within YAML string values is evaluated as an expression. Text outside `${...}` is treated as a plain string.

### Expression Types

| Syntax | Meaning | Example |
|--------|---------|---------|
| `${<type>.<name>.<attr>}` | Resource reference | `${skill.search-knowledge.id}` |
| `${file('<path>')}` | Inject file contents as string | `${file('./prompts/support.md')}` |

### Resource References

```
${skill.search-knowledge.id}        → Skill ID
${environment.python-data.id}       → Environment ID
${agent.support-bot.id}             → Agent ID
```

### File References

```yaml
agents:
  support-bot:
    system: ${file('./prompts/support.md')}
```

- Path is resolved relative to the location of `agup.yaml`
- File contents are expanded inline as a string value

### Embedding in Strings

Expressions can be embedded as part of a string:

```yaml
system: "You are ${file('./base-prompt.md')}\nAdditional instructions here."
skill_id: "${skill.search.id}"
description: "Uses skill ${skill.search.id} for lookup"
```

`file_ref` is resolved at plan time (expanded to string). `resource_ref` embedded in strings is resolved at apply time.

### Parser Implementation

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

### Expression Marker Format (Plan -> Apply)

Parsed expressions from the Parse/Execution Layer are represented as JSON markers for passing to the Apply Layer.

#### Standalone resource_ref

```typescript
{ __expr: "resource_ref", resource: "skill", name: "search", attr: "id" }
```

#### String embedding (template)

When `resource_ref` is mixed with text, a template marker is used:

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

At apply time, each `expr` part's AST is evaluated and concatenated with `text` parts to produce the final string.

#### Future Extension: Function Expressions

Function calls can be introduced as AST nodes to support transformation within templates:

```typescript
// AST for ${replace(skill.search.id, '-', '_')}
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

Since `parts[].ast` in templates accepts arbitrary expression AST nodes, adding functions only requires adding evaluation logic to the Apply Layer's evaluator.

## Validation

Validated using hand-written Zod schemas. Compile-time consistency with SDK TypeScript types is ensured via `satisfies`.

### Zod Schema

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

### SDK Type Consistency Check

```typescript
import type Anthropic from "@anthropic-ai/sdk";

type AgentCreateParams = Parameters<Anthropic["beta"]["agents"]["create"]>[0];
type AgentFromConfig = Omit<z.infer<typeof AgentConfigSchema>, "system"> & { system: string };

const _typeCheck: AgentCreateParams = {} as AgentFromConfig;
```
