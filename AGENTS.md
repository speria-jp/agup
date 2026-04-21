# AGENTS.md

## Project Overview

agup - Declarative management tool for Claude Managed Agent resources (Terraform-like)

## Tech Stack

- Runtime: Bun
- Language: TypeScript
- API client: @anthropic-ai/sdk

## Architecture

3-layer architecture:
1. Parse/Resolve Layer (Pure) - YAML parsing, Zod validation, expression parsing, DAG construction
2. Execution Layer (IO: FileSystem) - File resolution, hash computation, Plan generation
3. Apply Layer (IO: ApiClient) - API calls, State updates

## Project Structure

Monorepo with Bun workspaces:

```
packages/
├── core/              # @agup/core - Core logic library
│   └── src/
│       ├── parse/     # Parse/Resolve Layer
│       ├── execute/   # Execution Layer
│       ├── apply/     # Apply Layer
│       ├── api/       # ApiClient interface & implementation
│       ├── state/     # State management
│       ├── fs/        # FileSystem interface & implementation
│       └── types.ts   # Shared type definitions
└── cli/               # @agup/cli - CLI entry point (npx @agup/cli)
    └── src/
        └── index.ts
```

## Commands

```bash
bun run dev            # Run from source
bun run build          # Build for Node.js
bun run test           # Run tests (excludes e2e)
bun run test:e2e       # Run e2e tests (requires ANTHROPIC_API_KEY)
bun run lint           # Lint (oxlint)
```

## Docs Index

Use these documents as the primary references before making changes:

| Document | Contents |
|----------|----------|
| [docs/architecture.md](./docs/architecture.md) | 3-layer architecture, DAG/dependency resolution, DI interfaces, project structure |
| [docs/cli_spec.md](./docs/cli_spec.md) | CLI command spec, output format, exit codes |
| [docs/convention.md](./docs/convention.md) | Development conventions, coding rules, documentation policy |
| [docs/config_spec.md](./docs/config_spec.md) | YAML schema, expression syntax (`${...}`), Zod validation |
| [docs/state_spec.md](./docs/state_spec.md) | State file format, hash computation, change detection |
| [docs/operations.md](./docs/operations.md) | Operation type definitions, Anthropic API mapping, execution order, retry |
| [docs/testcases.md](./docs/testcases.md) | Layer-based test cases + scenario tests |
