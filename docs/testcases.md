# Test Cases

## Test Strategy

| Layer | Test Method | Mock |
|-------|------------|------|
| Parse/Resolve | Unit tests | None (pure functions) |
| Execution | Unit tests | Mock FileSystem |
| Apply | Integration tests | Mock ApiClient |

## Parse / Resolve Layer

### YAML Parse + Validation

| # | Case | Input | Expected |
|---|------|-------|----------|
| P-1 | Parse all resource types | YAML with environments + skills + agents | Config object |
| P-2 | Empty section | `environments: {}` | Empty environments map |
| P-3 | Omitted section | Only agents defined | environments, skills are undefined |
| P-4 | Missing required Agent field | Agent without name | ZodError |
| P-5 | Agent name too long | 257-char name | ZodError |
| P-6 | Invalid networking type | `type: "invalid"` | ZodError |
| P-7 | Object-form model | `{ id: "...", speed: "fast" }` | Parsed successfully |
| P-8 | Invalid metadata type | `metadata: { key: 123 }` | ZodError |

### Expression Parsing

| # | Case | Input | Expected |
|---|------|-------|----------|
| E-1 | Resource reference | `${skill.search.id}` | `{ type: "resource_ref", resource: "skill", name: "search", attr: "id" }` |
| E-2 | File reference | `${file('./prompt.md')}` | `{ type: "file_ref", path: "./prompt.md" }` |
| E-3 | Expression in string | `"prefix ${skill.x.id} suffix"` | Text before/after + Expr node |
| E-4 | Multiple expressions | `"${file('./a.md')} and ${skill.b.id}"` | 2 Expr nodes |
| E-5 | Invalid expression | `${invalid}` | Error |
| E-6 | Hyphenated name | `${skill.my-skill.id}` | Parsed successfully |

### DAG Construction

| # | Case | Input | Expected |
|---|------|-------|----------|
| D-1 | No dependencies | environment + skill only | Executable in any order |
| D-2 | Agent -> Skill dependency | Agent references `${skill.x.id}` | skill.x before agent |
| D-3 | Circular dependency | agent.a -> skill.b, skill.b -> agent.a | Error: circular dependency |
| D-4 | Multiple dependencies | Agent references multiple skills | All skills before agent |

## Execution Layer

### Plan Generation

| # | Case | Config + State | Expected Operations |
|---|------|---------------|---------------------|
| X-1 | New resources (all) | Config present, State empty | create x 3 |
| X-2 | No changes | Config and State hashes match | Empty operations |
| X-3 | Environment config change | Hash mismatch | update x 1 |
| X-4 | Skill file change | Directory hash mismatch | update x 1 |
| X-5 | Skill display_title change | Only title changed | destroy + create |
| X-6 | Resource removed from YAML | In State but not in Config | destroy x 1 |
| X-7 | Agent system with file ref | File content changed | update x 1 |

### Hash Computation

| # | Case | Input | Expected |
|---|------|-------|----------|
| H-1 | Same content -> same hash | Same config twice | Hashes match |
| H-2 | Different field order -> same hash | Only key order differs | Hashes match |
| H-3 | Value change -> different hash | 1 field changed | Hashes differ |
| H-4 | Skill directory | File added | Hashes differ |

### Template Marker Generation

| # | Case | Input | Expected |
|---|------|-------|----------|
| T-1 | Standalone resource_ref | `"${skill.search.id}"` | `{ __expr: "resource_ref", ... }` marker |
| T-2 | resource_ref + text mixed | `"prefix ${skill.search.id} suffix"` | `{ __expr: "template", parts: [text, expr, text] }` |
| T-3 | Multiple resource_refs | `"${skill.a.id} and ${skill.b.id}"` | `{ __expr: "template", parts: [expr, text, expr] }` |
| T-4 | file_ref + resource_ref mixed | `"${file('./x.md')} uses ${skill.s.id}"` | file part resolved, resource_ref part as expr |
| T-5 | Template without resource_ref | `"${file('./a.md')} and ${file('./b.md')}"` | Fully resolved plain string (no markers) |

### ${file(...)} Resolution

| # | Case | Input | Expected |
|---|------|-------|----------|
| F-1 | Valid file reference | Existing file path | File contents expanded |
| F-2 | File not found | Non-existent path | Error |
| F-3 | Relative path resolution | `./prompts/x.md` | Resolved relative to agup.yaml |

## Apply Layer

### API Calls

| # | Case | Operation | Expected API Call |
|---|------|-----------|-------------------|
| A-1 | Environment create | `{ type: "create", resource: "environment", ... }` | `POST /v1/environments` |
| A-2 | Environment update | `{ type: "update", resource: "environment", id: "..." }` | `POST /v1/environments/{id}` |
| A-3 | Skill create | `{ type: "create", resource: "skill", ... }` | `POST /v1/skills` (with files) |
| A-4 | Skill update | `{ type: "update", resource: "skill", ... }` | `POST /v1/skills/{id}/versions` |
| A-5 | Skill destroy | `{ type: "destroy", resource: "skill", ... }` | `DELETE /v1/skills/{id}` |
| A-6 | Agent create | `{ type: "create", resource: "agent", ... }` | `POST /v1/agents` |
| A-7 | Agent update | `{ type: "update", resource: "agent", ... }` | `POST /v1/agents/{id}` (with version) |
| A-8 | Agent archive | `{ type: "destroy", resource: "agent", ... }` | archive API |

### Sequential ${resource...} Resolution

| # | Case | State | Expected |
|---|------|-------|----------|
| R-1 | Existing resource reference | ID exists in State | ID retrieved from State |
| R-2 | New resource reference | Created earlier in same apply | ID from create result |
| R-3 | Unresolvable reference | Reference target doesn't exist | Error |
| R-4 | Template resolution (single ref) | `{ __expr: "template", parts: [text, expr, text] }` | Assembled string |
| R-5 | Template resolution (multiple refs) | Multiple expr parts | All resolved and concatenated |
| R-6 | Unresolved ref in template | expr target not in State | Error |
| R-7 | Template nested in params | `{ config: { url: template } }` | Recursively resolved |

### State Updates

| # | Case | State | Expected |
|---|------|-------|----------|
| S-1 | create success | | Entry added to State (id, hash, created_at) |
| S-2 | update success (Agent) | | version incremented, hash updated |
| S-3 | update success (Skill) | | latest_version updated, hash updated |
| S-4 | destroy success | | Entry removed from State |
| S-5 | Mid-apply failure (partial) | 2nd of 3 ops fails | 1st op result saved to State |

### Retry

| # | Case | API Response | Expected |
|---|------|-------------|----------|
| RT-1 | 429 | Rate limit | Retry and succeed |
| RT-2 | 500 | Server error | Retry up to 3 times |
| RT-3 | 400 | Bad request | Stop immediately with error |

## Scenario Tests (Integration Tests)

### S-1: Initial Deploy

Precondition: State empty, YAML defines environment + skill + agent

1. `plan` -> All resources shown as create
2. `apply` -> API calls (environment -> skill -> agent order)
3. State records ID and hash for all resources

### S-2: Skill File Update

Precondition: All resources applied. SKILL.md modified in skill directory

1. `plan` -> `~ skill.xxx (update)` shown
2. `apply` -> `POST /v1/skills/{id}/versions` called
3. State `latest_version` updated

### S-3: Agent References New Skill

Precondition: New skill reference added to existing agent

1. `plan` -> skill: create, agent: update
2. `apply` -> skill create -> returned ID -> used in agent update's skill_id
3. New skill added to State, agent hash updated

### S-4: Resource Deletion

Precondition: Agent definition removed from YAML

1. `plan` -> `- agent.xxx (destroy)` shown
2. `apply` -> archive API called
3. Entry removed from State

### S-5: Destroy All Resources

Precondition: All resources applied

1. `destroy` -> Deletes in order: Agent -> Skill -> Environment
2. State file cleared (empty resources)

### S-6: Recovery After Partial Apply

Precondition: API error on 2nd of 3 resource creates

1. `apply` -> 1st succeeds, 2nd fails, 3rd not executed
2. State records only 1st
3. Re-run `plan` -> Shows 2nd create + 3rd create
4. Re-run `apply` -> Creates remaining 2

### S-7: No Changes

Precondition: All resources applied. No YAML changes

1. `plan` -> "No changes. Infrastructure is up-to-date."

## E2E Tests

CLI-level tests using real files and real API (Anthropic).
Run explicitly with `bun run test:e2e` (not included in `bun test`).

### Prerequisites

- Environment variable `ANTHROPIC_API_KEY` required (exits with error if not set)
- agup.yaml + skill files placed in a temp directory
- CLI invoked via `Bun.spawn` running `bun run src/index.ts <command> --yes`
- On test failure, state file is kept and a manual cleanup message is displayed

### E2E-1: Full Lifecycle

Precondition: agup.yaml with environment + skill + agent placed in temp directory

1. `plan` -> exit 0, stdout shows create operations
2. `apply --yes` -> exit 0, resources created
3. agup.state.json generated with IDs for each resource
4. Modify a file in the skill directory
5. `plan` -> update operation shown
6. `apply --yes` -> exit 0, new version created
7. `destroy --yes` -> exit 0, all resources deleted
8. agup.state.json resources is empty

### E2E-2: Idempotency

Precondition: State after E2E-1 step 2 (all resources applied)

1. `plan` -> exit 0, "No changes. Infrastructure is up-to-date."
2. `apply --yes` -> exit 0, "No changes." (no API calls)

### E2E-3: Custom Config And State Paths

Precondition: Config file is placed at a non-default path and state file path is also overridden

1. `--config <custom-path> plan --state <custom-state-path>` -> exit 0, create operations shown
2. Relative `${file(...)}`
   and skill directory references are resolved relative to the custom config file location
3. `state --state <custom-state-path>` -> exit 0, custom state file is read instead of `./agup.state.json`
