# agentform

Claude Managed Agent のリソース（Agent, Skill, Environment）を宣言的に管理する CLI ツール。
Terraform ライクな plan/apply ワークフローで、YAML 定義と API を同期する。

## Usage

```bash
agentform plan      # 差分を表示
agentform apply     # API に反映
agentform destroy   # 全リソース削除
agentform state     # State を表示
```

## Configuration

`agentform.yaml` にリソースを定義する:

```yaml
environments:
  python-data:
    name: Python Data Environment
    config:
      type: cloud
      networking:
        type: unrestricted

skills:
  search-knowledge:
    display_title: Search Knowledge
    directory: ./skills/search-knowledge/

agents:
  support-bot:
    name: Support Bot
    model: claude-sonnet-4-6
    system: ${file('./prompts/support.md')}
    skills:
      - type: custom
        skill_id: ${skill.search-knowledge.id}
```

## Tech Stack

- Runtime: Bun
- Language: TypeScript
- Config: YAML
- API: `@anthropic-ai/sdk`

## Documentation

詳細な設計ドキュメントは [docs/](./docs/README.md) を参照。
