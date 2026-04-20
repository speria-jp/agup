# Operations Specification

## Operation Type Definition

```typescript
type ResourceType = "environment" | "skill" | "agent";

type Operation =
  | { type: "create"; resource: "environment"; name: string; params: EnvironmentParams }
  | { type: "update"; resource: "environment"; name: string; id: string; params: EnvironmentParams }
  | { type: "create"; resource: "skill"; name: string; params: SkillCreateParams }
  | { type: "update"; resource: "skill"; name: string; id: string; params: SkillUpdateParams }
  | { type: "create"; resource: "agent"; name: string; params: AgentParams }
  | { type: "update"; resource: "agent"; name: string; id: string; params: AgentParams }
  | { type: "destroy"; resource: ResourceType; name: string; id: string };
```

See `src/types.ts` for params type definitions.

## Operation to API Mapping

### Environment

| Operation | API | Notes |
|-----------|-----|-------|
| create | `POST /v1/environments` | |
| update | `POST /v1/environments/{id}` | Patch semantics. No optimistic locking |
| destroy | `POST /v1/environments/{id}` (archive) | |

#### create params

```typescript
{
  name: string;
  description?: string;
  config: {
    type: "cloud";
    networking?: { type: "unrestricted" } | { type: "limited"; allowed_hosts?: string[]; allow_mcp_servers?: boolean; allow_package_managers?: boolean };
    packages?: { pip?: string[]; npm?: string[]; apt?: string[]; cargo?: string[]; gem?: string[]; go?: string[] };
  };
  metadata?: Record<string, string>;
}
```

#### update params

Same structure as create. Omitted fields retain existing values.

### Skill

| Operation | API | Notes |
|-----------|-----|-------|
| create | `POST /v1/skills` | Includes file upload |
| update | `POST /v1/skills/{id}/versions` | On file changes. Apply Layer maps to create_version API |
| destroy | `DELETE /v1/skills/{id}` | Response: `{ id, type: "skill_deleted" }` |

#### create params

```typescript
{
  display_title?: string;
  files: File[];  // Files from the directory containing SKILL.md
}
```

#### update params

```typescript
{
  files: File[];
}
```

#### Change Detection

- `display_title` change -> Execution Layer expands into `destroy` + `create` (no update API exists)
- File content change -> `update` Operation (Apply Layer maps to `POST /v1/skills/{id}/versions`)

### Agent

| Operation | API | Notes |
|-----------|-----|-------|
| create | `POST /v1/agents` | |
| update | `POST /v1/agents/{id}` | `version` field required (optimistic locking) |
| destroy | `POST /v1/agents/{id}` (archive) | |

#### create params

```typescript
{
  name: string;
  description?: string;
  model: string | { id: string; speed?: "standard" | "fast" };
  system: string;
  mcp_servers?: { name: string; url: string }[];
  skills?: { type: "anthropic" | "custom"; skill_id: string; version?: string }[];
  tools?: object[];
  metadata?: Record<string, string>;
}
```

#### update params

In addition to create params:

```typescript
{
  version: number;  // From State. For optimistic locking
  // ...same fields as create params
}
```

## Execution Order

### Topological Sort Based on DAG

Operations are executed in topological order based on the dependency graph.

Default priority:
1. Environment (no dependencies)
2. Skill (no dependencies)
3. Agent (may depend on Skills)

### Destroy Execution Order

A dependency graph is built from State's `depends_on`, and resources are deleted in reverse create order (dependents first).

- `agup apply` destroy: Reverse of Plan's DAG order (derived from the same DAG as create/update)
- `agup destroy` command: Builds graph from State's `depends_on` and deletes in reverse topological order

```
Example: agent.bot depends_on ["skill.search"]
destroy order: agent.bot → skill.search → environment.dev
```

### Sequential `${resource...}` Resolution

When the Apply Layer executes Operations:
1. Recursively traverse the Operation's params
2. If a `ResourceRef` marker is found, retrieve the value from State (including results from already-executed creates)
3. If a `Template` marker is found, evaluate each part's AST and assemble the string
4. Call the API with resolved params

```typescript
// Standalone resource_ref (value is directly substituted)
type ResourceRef = {
  __expr: "resource_ref";
  resource: string;
  name: string;
  attr: string;
};

// String embedding (text and expressions mixed)
type TemplateRef = {
  __expr: "template";
  parts: Array<
    | { type: "text"; value: string }
    | { type: "expr"; ast: ExprAst }
  >;
};

// Expression AST node (extensible for future function expressions)
type ExprAst =
  | { type: "resource_ref"; resource: string; name: string; attr: string }
  | { type: "literal"; value: string }
  | { type: "call"; fn: string; args: ExprAst[] };
```

## Retry

| HTTP Status | Behavior |
|-------------|----------|
| 429 | Retry (exponential backoff) |
| 5xx | Retry (up to 3 times) |
| 4xx (except 429) | Stop immediately with error |
