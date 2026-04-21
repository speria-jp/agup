# agup - Documentation

Design/Spec documents for a declarative CLI tool that manages Claude Managed Agent resources.

## Index

| Document | Contents |
|----------|----------|
| [architecture.md](./architecture.md) | 3-layer architecture, DAG/dependency resolution, DI interfaces, project structure |
| [cli_spec.md](./cli_spec.md) | CLI command spec, output format, exit codes |
| [convention.md](./convention.md) | Development conventions, coding rules, documentation policy |
| [config_spec.md](./config_spec.md) | YAML schema, expression syntax (`${...}`), Zod validation |
| [state_spec.md](./state_spec.md) | State file format, hash computation, change detection |
| [operations.md](./operations.md) | Operation type definitions, Anthropic API mapping, execution order, retry |
| [testcases.md](./testcases.md) | Layer-based test cases + scenario tests |
