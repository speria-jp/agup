# Architecture

## Overview

agup is built on a 3-layer architecture. Each layer has well-defined inputs and outputs, and uses DI to remain testable.

```
┌─────────────────────────────────────────────────────────────┐
│  Parse / Resolve Layer (Pure, deterministic)                │
│                                                             │
│  Input:  YAML string                                        │
│  Output: Config (validated, with Expr nodes, DAG attached)  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Execution Layer (IO: FileSystem)                           │
│                                                             │
│  Input:  Config + State + FileSystem                        │
│  Output: Plan (list of Operations)                          │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Apply Layer (IO: ApiClient)                                │
│                                                             │
│  Input:  Plan + ApiClient + State                           │
│  Output: Updated State                                      │
└─────────────────────────────────────────────────────────────┘
```

## Layer Details

### Parse / Resolve Layer

Composed of pure functions. No external IO.

Responsibilities:
1. YAML parsing
2. Zod schema validation
3. Parse `${...}` expressions into Expr nodes (kept unresolved)
4. Build dependency graph (DAG) from Expr nodes

### Execution Layer

Performs file IO via the FileSystem interface.

Responsibilities:
1. Resolve `${file(...)}` (read files via FileSystem)
2. Read Skill directory files
3. Compute hashes (config values + file contents)
4. Diff against State -> derive Operations

### Apply Layer

Makes API calls via the ApiClient interface.

Responsibilities:
1. Execute Operations in topological order
2. Sequentially resolve `${resource...}` (propagate IDs from create results to downstream ops)
3. API calls (via ApiClient)
4. State update and persistence

## CLI Commands and Layer Mapping

```
agup plan  → Parse/Resolve + Execution → Display Plan
agup apply → Parse/Resolve + Execution + Apply → Update State
```

## DAG and Dependency Resolution

### Resource Dependencies

```
Environment (no dependencies)
Skill (no dependencies)
Agent (may depend on Skills)
```

`${resource.name.attr}` expressions create inter-resource dependencies. The DAG is topologically sorted to determine execution order.

### Dependency Persistence

During apply, each resource's `depends_on` is saved to State. This allows `agup destroy` to determine the correct deletion order without needing the config file.

- `agup apply`: Extracts dependency info from the config DAG and records it in State
- `agup destroy`: Builds a graph from State's `depends_on` and deletes in reverse topological order

### Circular Dependency Detection

If a cycle is detected during topological sort, the tool exits with an error.

```
Error: Circular dependency detected: agent.a → skill.b → agent.a
```

### Expression Resolution Timing

| Expression | Resolution Timing | Resolved By |
|------------|-------------------|-------------|
| `${file(...)}` | plan time | Execution Layer |
| `${resource.name.attr}` (standalone, existing) | plan time | Execution Layer (from State) |
| `${resource.name.attr}` (standalone, new) | apply time | Apply Layer (after create) |
| `${resource.name.attr}` (embedded in string) | apply time | Apply Layer (via template marker) |

At plan display time, unresolved references are shown as `(pending)`.

### Marker Format

JSON markers are used to propagate unresolved expressions from Execution Layer to Apply Layer:

- Standalone resource_ref: `{ __expr: "resource_ref", resource, name, attr }`
- Embedded in string: `{ __expr: "template", parts: [{ type: "text", value } | { type: "expr", ast }] }`

The Apply Layer's `deepResolveRefs` recursively resolves both formats. Expressions are kept as AST nodes, making it extensible for future function expressions.

## DI Interfaces

### FileSystem

```typescript
interface FileSystem {
  readFile(path: string): Promise<string>;
  readDirectory(path: string): Promise<File[]>;
}
```

### ApiClient

```typescript
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

## Project Structure

```
agup/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── parse/
│   │   ├── parser.ts         # YAML parse + expression parse -> Config + Expr nodes
│   │   ├── schema.ts         # Zod schema definitions & validation
│   │   ├── expression.ts     # ${...} expression parser
│   │   └── dag.ts            # Dependency graph construction & topological sort
│   ├── execute/
│   │   ├── planner.ts        # ${file(...)} resolution + hash computation + diff -> Plan
│   │   └── hash.ts           # Hash computation (config values + file contents)
│   ├── apply/
│   │   └── applier.ts        # Plan execution (${resource...} resolution + API calls + State update)
│   ├── api/
│   │   ├── interface.ts      # ApiClient interface definition
│   │   └── sdk-client.ts     # ApiClient implementation using Anthropic SDK
│   ├── state/
│   │   └── store.ts          # State file read/write
│   └── fs/
│       └── interface.ts      # FileSystem interface & implementation
├── tests/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
└── README.md
```

## Error Handling

- **API errors**: Retry on 429 and 5xx; all other errors are displayed and execution stops immediately
- **Partial apply**: If apply fails mid-way, state for successful operations is saved (partial apply)
- **State inconsistency**: `agup state refresh` fetches the latest state from the API and rebuilds the state file
