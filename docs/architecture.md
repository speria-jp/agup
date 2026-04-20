# Architecture

## Overview

agentform は 3 層アーキテクチャで構成される。各層は明確な入出力を持ち、DI によりテスタブルに保つ。

```
┌─────────────────────────────────────────────────────────────┐
│  Parse / Resolve Layer (Pure・決定的)                         │
│                                                              │
│  入力: YAML 文字列                                            │
│  出力: Config (バリデーション済み、Expr ノード含む、DAG 付き)     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Execution Layer (IO: FileSystem)                            │
│                                                              │
│  入力: Config + State + FileSystem                            │
│  出力: Plan (Operation リスト)                                │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Apply Layer (IO: ApiClient)                                 │
│                                                              │
│  入力: Plan + ApiClient + State                               │
│  出力: 更新された State                                       │
└─────────────────────────────────────────────────────────────┘
```

## レイヤ詳細

### Parse / Resolve Layer

純粋関数で構成される。外部 IO を一切行わない。

責務:
1. YAML パース
2. Zod スキーマによるバリデーション
3. `${...}` 式のパース → Expr ノード生成（未解決のまま保持）
4. Expr ノードから依存グラフ (DAG) 構築

### Execution Layer

FileSystem インターフェース経由でファイル IO を行う。

責務:
1. `${file(...)}` の解決（FileSystem 経由でファイル読み込み）
2. Skill ディレクトリのファイル読み込み
3. ハッシュ計算（設定内容 + ファイル内容）
4. State との diff → Operation 導出

### Apply Layer

ApiClient インターフェース経由で API 呼び出しを行う。

責務:
1. Operation をトポロジカル順に実行
2. `${resource...}` を逐次解決（create 結果の ID を後続に伝播）
3. API 呼び出し (ApiClient 経由)
4. State 更新・書き込み

## CLI コマンドと層の対応

```
agentform plan  → Parse/Resolve + Execution → Plan を表示
agentform apply → Parse/Resolve + Execution + Apply → State 更新
```

## DAG と依存解決

### リソース間の依存関係

```
Environment (依存なし)
Skill (依存なし)
Agent (→ Skill に依存する可能性あり)
```

`${resource.name.attr}` 式がリソース間の依存を生む。DAG をトポロジカルソートして実行順を決定する。

### 循環依存の検出

トポロジカルソート時に循環を検出した場合はエラー終了する。

```
Error: Circular dependency detected: agent.a → skill.b → agent.a
```

### 式の解決タイミング

| 式 | 解決タイミング | 解決するレイヤ |
|----|--------------|--------------|
| `${file(...)}` | plan 時 | Execution Layer |
| `${resource.name.attr}` (既存) | plan 時 | Execution Layer (State から取得) |
| `${resource.name.attr}` (新規) | apply 時 | Apply Layer (create 後に解決) |

plan 表示時、未解決の参照は `(pending)` と表示する。

## DI インターフェース

### FileSystem

```typescript
interface FileSystem {
  readFile(path: string): Promise<string>;
  readDirectory(path: string): Promise<File[]>;
}
```

### ApiClient

```typescript
interface ApiClient {
  agents: {
    create(params: AgentCreateParams): Promise<Agent>;
    update(id: string, params: AgentUpdateParams): Promise<Agent>;
    archive(id: string): Promise<void>;
  };
  skills: {
    create(params: SkillCreateParams): Promise<Skill>;
    createVersion(skillId: string, params: SkillVersionCreateParams): Promise<SkillVersion>;
    delete(skillId: string): Promise<void>;
  };
  environments: {
    create(params: EnvironmentCreateParams): Promise<Environment>;
    update(id: string, params: EnvironmentUpdateParams): Promise<Environment>;
    archive(id: string): Promise<void>;
  };
}
```

## プロジェクト構造

```
agentform/
├── src/
│   ├── index.ts              # CLI エントリーポイント
│   ├── parse/
│   │   ├── parser.ts         # YAML パース + 式パース → Config + Expr ノード
│   │   ├── schema.ts         # Zod スキーマ定義 & バリデーション
│   │   ├── expression.ts     # ${...} 式のパーサー
│   │   └── dag.ts            # 依存グラフ構築 & トポロジカルソート
│   ├── execute/
│   │   ├── planner.ts        # ${file(...)} 解決 + ハッシュ計算 + diff → Plan 生成
│   │   └── hash.ts           # ハッシュ計算 (設定内容 + ファイル内容)
│   ├── apply/
│   │   └── applier.ts        # Plan 実行 (${resource...} 解決 + API 呼び出し + State 更新)
│   ├── api/
│   │   ├── interface.ts      # ApiClient インターフェース定義
│   │   └── sdk-client.ts     # Anthropic SDK による ApiClient 実装
│   ├── state/
│   │   └── store.ts          # State ファイル読み書き
│   └── fs/
│       └── interface.ts      # FileSystem インターフェース & 実装
├── tests/
│   ├── parse/
│   ├── execute/
│   └── apply/
├── package.json
├── tsconfig.json
└── README.md
```

## エラーハンドリング

- **API エラー**: リトライ（429, 5xx）、それ以外は即座にエラー表示して停止
- **部分適用**: apply 途中で失敗した場合、成功した分の state は保存する（partial apply）
- **State 不整合**: `agentform state refresh` で API から最新状態を取得して state を再構築
