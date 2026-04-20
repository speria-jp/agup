# agentform - Documentation

Claude Managed Agent のリソースを宣言的に管理する CLI ツールの設計ドキュメント。

## Index

| ドキュメント | 内容 |
|------------|------|
| [architecture.md](./architecture.md) | 3層アーキテクチャ、DAG/依存解決、DI インターフェース、プロジェクト構造 |
| [cli_spec.md](./cli_spec.md) | CLI コマンド仕様、出力フォーマット、終了コード |
| [config_spec.md](./config_spec.md) | YAML スキーマ、式構文 (`${...}`)、Zod バリデーション |
| [state_spec.md](./state_spec.md) | State ファイルフォーマット、ハッシュ計算、変更検知 |
| [operations.md](./operations.md) | Operation 型定義、Anthropic API マッピング、実行順序、リトライ |
| [testcases.md](./testcases.md) | レイヤ I/F ベースのテストケース + シナリオテスト |

## 参考

| ドキュメント | 内容 |
|------------|------|
| [designs/initial-design.md](./designs/initial-design.md) | 初期設計ブレスト (正本は上記ドキュメント群) |
