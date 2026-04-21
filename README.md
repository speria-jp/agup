# agup

Declarative CLI for managing [Claude Managed Agent](https://docs.anthropic.com/en/docs/agents-and-tools/claude-managed-agents) resources (environments, skills, agents) via YAML configuration, inspired by Terraform.

## Install

```bash
npm install -g agup
```

Or run directly:

```bash
npx agup plan
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

Use `--yes` to skip confirmation prompts.

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

## How It Works

agup follows a plan/apply workflow:

1. **Parse** - Read `agup.yaml`, validate with Zod, build a dependency DAG
2. **Plan** - Compare config against `agup.state.json` (hash-based diff)
3. **Apply** - Execute API calls in dependency order, update state after each operation

State is stored in `agup.state.json` (add to `.gitignore`).

## Development

```bash
bun test          # Run unit/integration tests
bun run dev       # Run from source
bun run build     # Build for Node.js
bun run lint      # Lint with oxlint
```

## Documentation

See [docs/](./docs/README.md) for architecture and design details.

## License

MIT
