# CLAUDE.md

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

## Development Style

TDD workflow: write tests first, then implementation.

- Test cases defined in docs/testcases.md
- Each layer uses DI to swap in mocks for testing
- `bun run test` runs all tests
- All comments, variable names, and messages in code must be in English

## Commands

```bash
bun run dev            # Run from source
bun run build          # Build for Node.js
bun run test           # Run tests (excludes e2e)
bun run test:e2e       # Run e2e tests (requires ANTHROPIC_API_KEY)
bun run lint           # Lint (oxlint)
```

## Design Docs

See docs/ for detailed design. Update docs when making changes.
