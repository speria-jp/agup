# CLI Specification

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `agup plan` | YAML 定義と現在の state を比較し、差分を表示 |
| `agup apply` | plan の内容を実行して API に反映、state を更新 |
| `agup destroy` | state にある全リソースを削除 |
| `agup state` | 現在の state を表示 |

## `agup plan`

YAML 定義を読み込み、現在の state と比較して差分を表示する。API 呼び出しは行わない。

- YAML から消えたリソースは destroy として表示
- 未解決の `${resource...}` 参照は `(pending)` と表示

### 出力フォーマット

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

### 記号凡例

| 記号 | 意味 |
|------|------|
| `+` | create |
| `~` | update |
| `^` | new version (Skill のみ) |
| `-` | destroy |

## `agup apply`

plan の内容を実行し、API に反映して state を更新する。

- create / update / destroy 全てを含む
- トポロジカル順に実行（依存先から順に作成）
- 途中で失敗した場合、成功した分の state は保存する（partial apply）

### 実行フロー

1. plan を生成（`agup plan` と同等）
2. plan の内容を表示
3. 確認プロンプト表示（`Proceed? [y/N]`）
4. 承認後、Operation を順次実行
5. 各 Operation 完了ごとに state を更新

## `agup destroy`

state にある全リソースを削除する。

- State の `depends_on` から依存グラフを構築し、逆トポロジカル順で削除（依存する側から先に削除）
- 削除後、state ファイルをクリア

## `agup state`

現在の state ファイルの内容を表示する。

### サブコマンド (Phase 2)

| サブコマンド | 説明 |
|------------|------|
| `agup state refresh` | API から最新状態を取得して state を再構築 |

## グローバルオプション (Phase 2)

| オプション | 説明 |
|-----------|------|
| `--config <path>` | 設定ファイルパス (デフォルト: `./agup.yaml`) |
| `--state <path>` | State ファイルパス (デフォルト: `./agup.state.json`) |
| `-y, --yes` | 確認プロンプトをスキップ (CI/CD 向け) |

## 終了コード

| コード | 意味 |
|--------|------|
| 0 | 成功 |
| 1 | エラー（バリデーション失敗、API エラーなど） |
| 2 | plan に差分あり（CI での drift 検知用、Phase 2） |
