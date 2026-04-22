# agup

Declarative CLI for managing [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) resources (environments, skills, agents) via YAML configuration, inspired by Terraform.

## Install

```bash
npm install -g @agup/cli
```

Or run directly:

```bash
npx @agup/cli plan
```

## Quick Start

1. Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

2. Create `agup.yaml`:

```yaml
environments:
  sandbox:
    name: My Sandbox
    config:
      type: cloud
      networking:
        type: unrestricted

skills:
  search:
    display_title: Web Search Skill
    directory: ./skills/search

agents:
  assistant:
    name: My Assistant
    model: claude-sonnet-4-6-20250514
    system: ${file('./prompts/system.md')}
    skills:
      - type: custom
        skill_id: ${skill.search.id}
    tools:
      - type: agent_toolset_20260401
```

3. Preview and apply:

```bash
agup plan     # Show what will change
agup apply    # Apply changes
```

## Commands

| Command   | Description                       |
|-----------|-----------------------------------|
| `plan`    | Show execution plan               |
| `apply`   | Apply changes (with confirmation) |
| `destroy` | Destroy all managed resources     |
| `state`   | Show current state                |

Global options:

- `-v, --version` - Show version
- `-y, --yes` - Skip confirmation prompts
- `--config <path>` - Use a custom config file path
- `--state <path>` - Use a custom state file path

Examples:

```bash
agup --config ./configs/prod.yaml plan
agup apply --yes --state ./tmp/agup.state.json
```

## Configuration

### Expression Syntax

Use `${...}` expressions in YAML string values:

- **File reference**: `${file('./path/to/file.md')}` - inline file contents
- **Resource reference**: `${skill.search.id}` - reference another resource's ID

### Resource Types

- **Environment** - sandbox execution environment with networking/package config
- **Skill** - reusable skill backed by a local directory containing `SKILL.md`
- **Agent** - Claude agent with model, system prompt, skills, and tools

See [docs/config_spec.md](docs/config_spec.md) for the full YAML schema.

## Features

- [x] Declarative YAML configuration for environments, skills, and agents
- [x] Plan/apply workflow with confirmation prompt
- [x] Expression syntax: `${file(...)}` for file injection, `${resource.name.id}` for cross-resource references
- [x] Dependency graph (DAG) with automatic topological ordering
- [x] Hash-based change detection (only applies what changed)
- [x] Partial apply: saves progress on failure, resumes on next run
- [x] `destroy` command with reverse-dependency ordering
- [x] `--config` / `--state` options for custom file paths
- [ ] `state refresh` to sync state from remote API
- [ ] Drift detection exit code for CI (`plan` returns exit 2 on diff)

## How It Works

agup follows a plan/apply workflow:

1. **Parse** - Read `agup.yaml`, validate with Zod, build a dependency DAG
2. **Plan** - Compare config against `agup.state.json` (hash-based diff)
3. **Apply** - Execute API calls in dependency order, update state after each operation

State is stored in `agup.state.json`. You can commit it to share state across a team, or add it to `.gitignore` for local-only management.

## Project Structure

Monorepo with Bun workspaces:

| Package | Description |
|---------|-------------|
| [`@agup/core`](packages/core) | Core logic (parse, execute, apply, state) |
| [`@agup/cli`](packages/cli) | CLI entry point |

## Development

```bash
bun run test       # Run unit/integration tests (all packages)
bun run test:e2e   # Run e2e tests (requires ANTHROPIC_API_KEY)
bun run dev        # Run CLI from source
bun run build      # Build CLI for Node.js
bun run lint       # Lint with oxlint
bun run typecheck  # Type check all packages
```

## Documentation

See [docs/](./docs/README.md) for architecture and design details.

## License

MIT
