# Development Conventions

Shared conventions for developing `agup`.

## Development Workflow

- Follow TDD: write tests first, then implementation
- Define test cases in [testcases.md](./testcases.md)
- Use dependency injection so each layer can be tested with mocks
- Run `bun run test` for the standard test suite
- Follow Conventional Commits for commit messages

## Code Conventions

- Write all code comments in English
- Use English for variable names
- Use English for user-facing messages emitted from code
- Do not use Bun-specific APIs in production code
- Treat Node.js as the compatibility target for the CLI

## Documentation Conventions

- Update relevant documents under `docs/` when behavior or design changes
- Add durable project rules here
- Add new design and specification documents to [README.md](./README.md)

## Related Sources

- [../AGENTS.md](../AGENTS.md)
- [testcases.md](./testcases.md)
