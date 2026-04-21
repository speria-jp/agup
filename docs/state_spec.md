# State Specification

## File

Default path: `./agup.state.json`

## Format

```jsonc
{
  "version": 1,
  "resources": {
    "<type>.<logical-name>": {
      "type": "<resource-type>",
      "logical_name": "<logical-name>",
      "id": "<api-id>",
      "created_at": "<ISO8601>",
      "last_applied_hash": "sha256:<hex>",
      // type-specific fields
    }
  }
}
```

## Resource Key

Format: `<type>.<logical-name>`. Examples: `environment.python-data`, `skill.search-knowledge`, `agent.support-bot`

## Resource Entry

### Common Fields

| Field | Type | Description |
|-------|------|-------------|
| type | string | `"environment"` / `"skill"` / `"agent"` |
| logical_name | string | Logical name from YAML definition |
| id | string | ID returned from the API |
| depends_on | string[] | List of dependency resource keys (e.g. `["skill.search"]`) |
| created_at | string | Creation timestamp (ISO8601) |
| last_applied_hash | string | Hash of the config at last apply |

### Environment-specific Fields

None.

### Skill-specific Fields

| Field | Type | Description |
|-------|------|-------------|
| latest_version | string | Latest version ID |

### Agent-specific Fields

| Field | Type | Description |
|-------|------|-------------|
| version | number | Version number for optimistic locking |

## State File Example

```json
{
  "version": 1,
  "resources": {
    "environment.python-data": {
      "type": "environment",
      "logical_name": "python-data",
      "id": "env_01ABC...",
      "depends_on": [],
      "created_at": "2026-04-20T10:00:00Z",
      "last_applied_hash": "sha256:a1b2c3..."
    },
    "skill.search-knowledge": {
      "type": "skill",
      "logical_name": "search-knowledge",
      "id": "skill_01XYZ...",
      "depends_on": [],
      "latest_version": "1759178010641129",
      "created_at": "2026-04-20T10:00:00Z",
      "last_applied_hash": "sha256:d4e5f6..."
    },
    "agent.support-bot": {
      "type": "agent",
      "logical_name": "support-bot",
      "id": "agent_01DEF...",
      "depends_on": ["skill.search-knowledge"],
      "version": 3,
      "created_at": "2026-04-20T10:00:00Z",
      "last_applied_hash": "sha256:g7h8i9..."
    }
  }
}
```

## Hash Computation

`last_applied_hash` is used to detect config changes.

### What Is Hashed

| Resource | Hash Target |
|----------|-------------|
| Environment | Config values from YAML |
| Skill | All file contents in directory + `display_title` |
| Agent | Config values from YAML + contents of files referenced by `${file(...)}` |

### Algorithm

1. Normalize target data (JSON.stringify with sorted keys)
2. Hash with SHA-256
3. Store as `sha256:<hex>`

### Change Detection Flow

1. Read YAML definition
2. Compute hash from each resource's config
3. Compare with `last_applied_hash` in State
4. Mismatch -> change detected (included in plan)

## Dependency Recording

### `depends_on` Field

Dependencies are recorded in state during apply. Dependencies are extracted from the Plan's DAG (built from `${resource.name.attr}` expressions).

```
agent.support-bot's params contain ${skill.search-knowledge.id}
→ depends_on: ["skill.search-knowledge"]
```

### Purpose

- Determines correct deletion order for `agup destroy` (no config needed)
- Updated on every apply (tracks dependency changes)

### Graph Construction

Reverse topological sort from `depends_on`:
1. All resources become nodes
2. Each `depends_on` entry becomes an edge (A depends_on B → A → B)
3. Reverse of topological sort = destroy order

## Special Cases

### In State but not in YAML

Shown as a destroy operation in plan. Deleted during apply.

### In YAML but not in State

Shown as a create operation in plan.

### Partial Apply

If apply fails mid-way, results of successful Operations are saved to state. This ensures the next plan correctly computes the remaining diff.
