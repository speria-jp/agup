# CLI Specification

## Commands

| Command | Description |
|---------|-------------|
| `agup plan` | Compare YAML definitions against current state and display the diff |
| `agup apply` | Execute the plan, call APIs, and update state |
| `agup destroy` | Delete all resources in state |
| `agup state` | Display the current state file |
| `agup version` | Display the CLI version |

## `agup plan`

Reads the YAML definition, compares it with the current state, and displays the diff. No API calls are made.

- Resources removed from YAML are shown as destroy operations
- Unresolved `${resource...}` references are shown as `(pending)`

### Output Format

```
agup plan

~ environment.python-data (update)
    networking.allowed_hosts: ["api.example.com"] → ["api.example.com", "db.example.com"]

+ skill.data-processor (create)
    display_title: "Data Processor"
    directory: ./skills/data-processor/

^ skill.search-knowledge (new version)
    files changed: SKILL.md, utils.py

~ agent.support-bot (update)
    skills: added skill.data-processor

- agent.old-bot (destroy)

Plan: 1 to create, 2 to update, 1 to destroy.
```

### Symbol Legend

| Symbol | Meaning |
|--------|---------|
| `+` | create |
| `~` | update |
| `^` | new version (Skill only) |
| `-` | destroy |

## `agup apply`

Executes the plan, calls APIs, and updates state.

- Includes create, update, and destroy operations
- Executes in topological order (dependencies first)
- On failure, saves state for successful operations (partial apply)

### Execution Flow

1. Generate plan (same as `agup plan`)
2. Display plan
3. Show confirmation prompt (`Proceed? [y/N]`)
4. After approval, execute Operations sequentially
5. Update state after each Operation completes

## `agup destroy`

Deletes all resources in state.

- Builds dependency graph from State's `depends_on` and deletes in reverse topological order (dependents first)
- Clears state file after deletion

## `agup state`

Displays the current state file contents.

### Subcommands (Phase 2)

| Subcommand | Description |
|------------|-------------|
| `agup state refresh` | Fetch latest state from API and rebuild state file |

## `agup version`

Displays the CLI version.

```
agup version
agup 0.1.0
```

Also available as `--version` or `-v` flag with any command.

```
agup --version
agup 0.1.0
```

## `agup --help`

Displays CLI usage information and exits successfully.

```
agup --help
Usage: agup <command> [options]
```

## Global Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Display help |
| `-v, --version` | Display the CLI version |
| `-y, --yes` | Skip confirmation prompts (for CI/CD) |
| `--config <path>` | Config file path (default: `./agup.yaml`) |
| `--state <path>` | State file path (default: `./agup.state.json`) |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (validation failure, API error, etc.) |
| 2 | Plan has diff (for CI drift detection, Phase 2) |
