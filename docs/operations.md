# Operations Specification

## Operation 型定義

```typescript
type ResourceType = "environment" | "skill" | "agent";

type Operation =
  | { type: "create"; resource: ResourceType; name: string; params: Record<string, unknown> }
  | { type: "update"; resource: ResourceType; name: string; id: string; params: Record<string, unknown> }
  | { type: "create_version"; resource: "skill"; name: string; id: string; params: Record<string, unknown> }
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
| create_version | `POST /v1/skills/{id}/versions` | ファイル変更時 |
| destroy | `DELETE /v1/skills/{id}` | レスポンス: `{ id, type: "skill_deleted" }` |

#### create params

```typescript
{
  display_title?: string;
  files: File[];  // SKILL.md を含むディレクトリ内のファイル群
}
```

#### create_version params

```typescript
{
  files: File[];
}
```

#### 変更検知

- `display_title` 変更 → delete + create（update API がないため）
- ファイル内容変更 → create_version

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

create の逆順。依存される側を後に削除する。

```
destroy 順: Agent → Skill → Environment
```

### `${resource...}` の逐次解決

Apply Layer が Operation を実行する際:
1. Operation の params 内に `ResourceRef` がないか走査
2. `ResourceRef` があれば、既に実行済みの create 結果から ID を取得
3. ID を注入して API 呼び出し

```typescript
type ResourceRef = {
  __expr: "resource_ref";
  resource: string;
  name: string;
  attr: string;
};
```

## リトライ

| HTTP Status | 挙動 |
|-------------|------|
| 429 | リトライ（exponential backoff） |
| 5xx | リトライ（最大 3 回） |
| 4xx (429 以外) | 即座にエラー表示して停止 |
