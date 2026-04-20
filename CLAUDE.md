# CLAUDE.md

## Project Overview

agup - Claude Managed Agent リソースの宣言的管理ツール (Terraform-like)

## Tech Stack

- Runtime: Bun
- Language: TypeScript
- Config format: YAML (agup.yaml)
- State: agup.state.json
- API client: @anthropic-ai/sdk

## Architecture

3層構造:
1. Parse/Resolve Layer (Pure) - YAML パース、Zod バリデーション、式パース、DAG 構築
2. Execution Layer (IO: FileSystem) - ファイル解決、ハッシュ計算、Plan 生成
3. Apply Layer (IO: ApiClient) - API 呼び出し、State 更新

## Project Structure

```
src/
├── index.ts           # CLI エントリーポイント
├── parse/             # Parse/Resolve Layer
├── execute/           # Execution Layer
├── apply/             # Apply Layer
├── api/               # ApiClient インターフェース & 実装
├── state/             # State 管理
└── fs/                # FileSystem インターフェース & 実装
```

## Development Style

TDD で実装を進める。テストを先に書き、実装を後から書く。

- テストケースは docs/testcases.md に定義済み
- レイヤごとに DI でモックを差し替えてテスト
- `bun test` で全テスト実行
- コード内のコメント・変数名・メッセージは全て英語で書く

## Commands

```bash
bun run dev            # 開発実行
bun test               # テスト実行
bun run lint           # Lint (oxlint)
```

## Design Docs

設計の詳細は docs/ を参照。変更時はドキュメントも更新すること。
