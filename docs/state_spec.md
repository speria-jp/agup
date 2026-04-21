# State Specification

## ファイル

デフォルトパス: `./agup.state.json`

## フォーマット

```jsonc
{
  "version": 1,
  "resources": {
    "<type>.<logical-name>": {
      "type": "<resource-type>",
      "logical_name": "<logical-name>",
      "id": "<api-id>",
      "created_at": "<ISO8601>",
      "last_applied_hash": "sha256:<hex>",
      // type-specific fields
    }
  }
}
```

## リソースキー

`<type>.<logical-name>` の形式。例: `environment.python-data`, `skill.search-knowledge`, `agent.support-bot`

## リソースエントリ

### 共通フィールド

| フィールド | 型 | 説明 |
|-----------|-----|------|
| type | string | `"environment"` / `"skill"` / `"agent"` |
| logical_name | string | YAML 定義内の論理名 |
| id | string | API から返された ID |
| depends_on | string[] | 依存先リソースキーのリスト (例: `["skill.search"]`) |
| created_at | string | 作成日時 (ISO8601) |
| last_applied_hash | string | 最後に apply した設定内容のハッシュ |

### Environment 固有フィールド

なし。

### Skill 固有フィールド

| フィールド | 型 | 説明 |
|-----------|-----|------|
| latest_version | string | 最新バージョン ID |

### Agent 固有フィールド

| フィールド | 型 | 説明 |
|-----------|-----|------|
| version | number | 楽観的ロック用バージョン番号 |

## State ファイル例

```json
{
  "version": 1,
  "resources": {
    "environment.python-data": {
      "type": "environment",
      "logical_name": "python-data",
      "id": "env_01ABC...",
      "depends_on": [],
      "created_at": "2026-04-20T10:00:00Z",
      "last_applied_hash": "sha256:a1b2c3..."
    },
    "skill.search-knowledge": {
      "type": "skill",
      "logical_name": "search-knowledge",
      "id": "skill_01XYZ...",
      "depends_on": [],
      "latest_version": "1759178010641129",
      "created_at": "2026-04-20T10:00:00Z",
      "last_applied_hash": "sha256:d4e5f6..."
    },
    "agent.support-bot": {
      "type": "agent",
      "logical_name": "support-bot",
      "id": "agent_01DEF...",
      "depends_on": ["skill.search-knowledge"],
      "version": 3,
      "created_at": "2026-04-20T10:00:00Z",
      "last_applied_hash": "sha256:g7h8i9..."
    }
  }
}
```

## ハッシュ計算

`last_applied_hash` は設定内容の変更検知に使用する。

### 計算対象

| リソース | ハッシュ対象 |
|---------|------------|
| Environment | YAML 定義の設定値 |
| Skill | ディレクトリ内の全ファイル内容 + `display_title` |
| Agent | YAML 定義の設定値 + `${file(...)}` で参照されるファイル内容 |

### アルゴリズム

1. 対象データを正規化（JSON.stringify でキーソート）
2. SHA-256 でハッシュ化
3. `sha256:<hex>` 形式で保存

### 変更検知フロー

1. YAML 定義を読み込み
2. 各リソースの設定内容からハッシュを計算
3. State 内の `last_applied_hash` と比較
4. 不一致 → 変更あり（plan に含める）

## 依存関係の記録

### `depends_on` フィールド

Apply 時に各リソースの依存先を state に記録する。依存は Plan の DAG（`${resource.name.attr}` 式から構築）から抽出する。

```
agent.support-bot の params に ${skill.search-knowledge.id} がある
→ depends_on: ["skill.search-knowledge"]
```

### 用途

- `agup destroy` コマンドで正しい削除順序を決定する（config が不要）
- Apply 時に毎回更新される（依存が変わった場合に追従）

### グラフ構築

`depends_on` からの逆トポロジカルソート:
1. 全リソースをノードとする
2. `depends_on` の各エントリをエッジとする（A depends_on B → A → B）
3. トポロジカルソートの逆順が destroy 順

## 特殊ケース

### State にあるが YAML にない

destroy 対象として plan に表示する。apply 時に削除する。

### YAML にあるが State にない

create 対象として plan に表示する。

### Partial Apply

apply 途中で失敗した場合、成功した Operation の結果は state に保存する。次回 plan 時に正しい差分を計算できるようにする。
