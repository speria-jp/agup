# TODO - Implementation Steps

## 1. Project Setup

- [x] `bun init` + package.json configuration
- [x] TypeScript configuration (tsconfig.json)
- [x] Install dependencies: zod, yaml, @anthropic-ai/sdk
- [x] Linter setup (oxlint)
- [x] Directory structure (src/, tests/)
- [x] Test environment setup (bun test)

## 2. Type Definitions & Interfaces

- [x] Resource type definitions (ResourceType, Operation, Plan)
- [x] FileSystem interface (src/fs/interface.ts)
- [x] ApiClient interface (src/api/interface.ts)
- [x] State type definitions (StateFile, ResourceEntry)

## 3. Parse / Resolve Layer

- [x] Zod schema definitions (src/parse/schema.ts)
  - [x] EnvironmentConfigSchema
  - [x] SkillConfigSchema
  - [x] AgentConfigSchema
  - [x] AgentformConfigSchema (top-level)
- [x] Expression parser (src/parse/expression.ts)
  - [x] Expression detection via EXPR_PATTERN
  - [x] file reference parsing
  - [x] resource reference parsing
  - [x] Multiple expressions in a single string
- [x] YAML parser (src/parse/parser.ts)
  - [x] YAML loading + Zod validation
  - [x] Parse expressions in string values into Expr nodes
- [x] DAG construction (src/parse/dag.ts)
  - [x] Extract dependency edges from resource references
  - [x] Topological sort
  - [x] Circular dependency detection

## 4. State Management

- [x] State file reading (src/state/store.ts)
- [x] State file writing
- [x] Resource entry add/update/delete

## 5. Execution Layer

- [x] Hash computation (src/execute/hash.ts)
  - [x] Value normalization (key-sorted JSON)
  - [x] SHA-256 hashing
  - [x] Skill directory hashing (all files)
- [x] Planner (src/execute/planner.ts)
  - [x] ${file(...)} resolution
  - [x] State diff (hash comparison)
  - [x] create Operation derivation (not in State)
  - [x] update Operation derivation (hash mismatch)
  - [x] create_version Operation derivation (Skill file changes)
  - [x] destroy Operation derivation (not in YAML)
  - [x] Skill display_title change -> destroy + create

## 6. Apply Layer

- [x] Applier (src/apply/applier.ts)
  - [x] Execute Operations in topological order
  - [x] Sequential ${resource...} resolution
  - [x] Environment create/update/archive
  - [x] Skill create/createVersion/delete
  - [x] Agent create/update/archive (with version)
  - [x] State update (after each Operation)
  - [x] Partial apply (save successful ops on failure)

## 7. ApiClient Implementation

- [x] Anthropic SDK wrapper (src/api/sdk-client.ts)
  - [x] Environment API (create, update, archive)
  - [x] Skill API (create, createVersion, delete)
  - [x] Agent API (create, update, archive)
  - [x] Retry (429, 5xx)

## 8. CLI

- [x] Entry point (src/index.ts)
- [x] `plan` command
  - [x] YAML loading -> Parse -> Execution -> Plan display
  - [x] Diff format output (+, ~, ^, -)
- [x] `apply` command
  - [x] Show plan -> confirmation prompt -> Apply execution
- [x] `destroy` command
  - [x] Load State -> delete all resources in reverse order
- [x] `state` command
  - [x] Display State file

## 9. Tests

- [x] Parse Layer tests
  - [x] Schema validation (P-1 ~ P-8)
  - [x] Expression parsing (E-1 ~ E-6)
  - [x] DAG (D-1 ~ D-4)
- [x] Execution Layer tests (mock FileSystem)
  - [x] Plan generation (X-1 ~ X-4, X-6, X-7)
  - [x] Hash computation (H-1 ~ H-4)
  - [x] File resolution (F-1 ~ F-3)
- [x] Apply Layer tests (mock ApiClient)
  - [x] API calls (A-1, A-3 ~ A-6, A-8)
  - [x] Reference resolution (R-2 ~ R-3)
  - [x] State updates (S-1, S-3 ~ S-5)

## 10. Remaining Tests

- [x] X-5: Skill display_title change test
- [x] A-2: Environment update test
- [x] A-7: Agent update test
- [x] R-1: Existing resource reference test
- [x] S-2: Agent update version increment test
- [x] E2E scenario tests (S-1 ~ S-7)
- [ ] Retry tests (RT-1 ~ RT-3)

## 11. npx Support & Release Preparation

- [x] Replace `Bun.CryptoHasher` with `node:crypto` `createHash` (src/execute/hash.ts)
- [x] Add `bun build --target=node` build script (package.json `build`)
- [x] package.json: add `bin` field (`"bin": { "agup": "./dist/index.js" }`)
- [x] package.json: add `files` field (`["dist"]`)
- [x] package.json: remove `private: true`
- [x] Verify build artifact (`node dist/index.js plan`)
- [x] README.md
- [x] LICENSE
- [ ] npm publish

## 12. Review Fixes

- **File Read**: `${file(...)}` resolves paths relative to basePath, but there is no defense against path traversal (e.g. `../../../etc/passwd`). Not an issue with trusted input, but access should be restricted to within basePath for shared environments.
- **State File**: Document as a policy in the spec that state files must never contain credentials.
