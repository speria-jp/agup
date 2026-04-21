# Operations Specification

## Operation 型定義

```typescript
type ResourceType = "environment" | "skill" | "agent";

type Operation =
  | { type: "create"; resource: ResourceType; name: string; params: Record<string, unknown> }
  | { type: "update"; resource: ResourceType; name: string; id: string; params: Record<string, unknown> }
  | { type: "destroy"; resource: ResourceType; name: string; id: string };
```

## Operation と API のマッピング

### Environment

| Operation | API | 備考 |
|-----------|-----|------|
| create | `POST /v1/environments` | |
| update | `POST /v1/environments/{id}` | パッチセマンティクス。楽観的ロックなし |
| destroy | `POST /v1/environments/{id}` (archive) | |

#### create params

```typescript
{
  name: string;
  description?: string;
  config: {
    type: "cloud";
    networking?: { type: "unrestricted" } | { type: "limited"; allowed_hosts?: string[]; allow_mcp_servers?: boolean; allow_package_managers?: boolean };
    packages?: { pip?: string[]; npm?: string[]; apt?: string[]; cargo?: string[]; gem?: string[]; go?: string[] };
  };
  metadata?: Record<string, string>;
}
```

#### update params

create と同じ構造。omit したフィールドは既存値保持。

### Skill

| Operation | API | 備考 |
|-----------|-----|------|
| create | `POST /v1/skills` | ファイルアップロード含む |
| update | `POST /v1/skills/{id}/versions` | ファイル変更時。Apply Layer が create_version API にマッピング |
| destroy | `DELETE /v1/skills/{id}` | レスポンス: `{ id, type: "skill_deleted" }` |

#### create params

```typescript
{
  display_title?: string;
  files: File[];  // SKILL.md を含むディレクトリ内のファイル群
}
```

#### update params

```typescript
{
  files: File[];
}
```

#### 変更検知

- `display_title` 変更 → Execution Layer が `destroy` + `create` の 2 Operation に展開（update API がないため）
- ファイル内容変更 → `update` Operation（Apply Layer が `POST /v1/skills/{id}/versions` にマッピング）

### Agent

| Operation | API | 備考 |
|-----------|-----|------|
| create | `POST /v1/agents` | |
| update | `POST /v1/agents/{id}` | `version` フィールド必須（楽観的ロック） |
| destroy | `POST /v1/agents/{id}` (archive) | |

#### create params

```typescript
{
  name: string;
  description?: string;
  model: string | { id: string; speed?: "standard" | "fast" };
  system: string;
  mcp_servers?: { name: string; url: string }[];
  skills?: { type: "anthropic" | "custom"; skill_id: string; version?: string }[];
  tools?: object[];
  metadata?: Record<string, string>;
}
```

#### update params

create params に加えて:

```typescript
{
  version: number;  // State から取得。楽観的ロック用
  // ...create params と同じフィールド
}
```

## 実行順序

### DAG に基づくトポロジカルソート

Operation は依存グラフに基づきトポロジカル順に実行する。

基本的な優先度:
1. Environment (依存なし)
2. Skill (依存なし)
3. Agent (Skill に依存する可能性あり)

### destroy の実行順序

State の `depends_on` から依存グラフを構築し、create の逆順で削除する（依存する側を先に削除）。

- `agup apply` 内の destroy: Plan の DAG 逆順（create/update と同じ DAG から導出）
- `agup destroy` コマンド: State の `depends_on` からグラフを構築し逆トポロジカル順で削除

```
例: agent.bot depends_on ["skill.search"]
destroy 順: agent.bot → skill.search → environment.dev
```

### `${resource...}` の逐次解決

Apply Layer が Operation を実行する際:
1. Operation の params を再帰的に走査
2. `ResourceRef` マーカーがあれば、State（既に実行済みの create 結果含む）から値を取得
3. `Template` マーカーがあれば、各パートの AST を評価し文字列を組み立てる
4. 解決済みの params で API 呼び出し

```typescript
// 単独の resource_ref（値がそのまま置換される）
type ResourceRef = {
  __expr: "resource_ref";
  resource: string;
  name: string;
  attr: string;
};

// 文字列埋め込み（テキストと式が混在）
type TemplateRef = {
  __expr: "template";
  parts: Array<
    | { type: "text"; value: string }
    | { type: "expr"; ast: ExprAst }
  >;
};

// 式 AST ノード（将来の関数式にも対応）
type ExprAst =
  | { type: "resource_ref"; resource: string; name: string; attr: string }
  | { type: "literal"; value: string }
  | { type: "call"; fn: string; args: ExprAst[] };
```

## リトライ

| HTTP Status | 挙動 |
|-------------|------|
| 429 | リトライ（exponential backoff） |
| 5xx | リトライ（最大 3 回） |
| 4xx (429 以外) | 即座にエラー表示して停止 |
