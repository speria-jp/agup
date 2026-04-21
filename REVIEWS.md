# Code Review - agup v0.1.0

**Date**: 2026-04-21
**Reviewer**: Claude
**Status**: All tests pass (44 tests, 75 expect), lint clean, typecheck clean

---

## Summary

全体として仕様に忠実な実装であり、3層アーキテクチャ・DI・Immutable State など設計方針が一貫している。Phase 1 の機能はほぼ完備しているが、いくつかのバグ・仕様乖離・改善点がある。

---

## 1. Bugs / 仕様不整合

### 1.1 [HIGH] ~~`computeQuickHash` と `computeHash` の不一致~~ ✅ Fixed

- **場所**: `src/apply/applier.ts:205-209` vs `src/execute/hash.ts:3-7`
- **問題**: Planner はキーソート (`sortKeys`) した上でハッシュを計算するが、Applier の `computeQuickHash` はソートなしで `JSON.stringify` している。同じデータでもハッシュが異なる可能性があり、次回 `plan` 時に変更なしにも関わらず update が生成される。
- **仕様**: state_spec.md に「Normalize target data (JSON.stringify with sorted keys)」と明記
- **修正案**: Applier から `computeHash` を import して使用する

### 1.2 [HIGH] ~~`createResource` で `logical_name` が空文字列~~ ✅ Fixed

- **場所**: `src/apply/applier.ts:122, 130, 140`
- **問題**: State エントリの `logical_name` が常に `""` で保存される。Operation には `name` フィールドがあるが渡されていない。
- **影響**: `destroy` コマンドで `state.resources` を走査する際に `entry.logical_name` を使用しているため、destroy が正しく動作しない
- **修正案**: `createResource` に `name` を渡し、`logical_name: name` を設定する

### 1.3 [MEDIUM] ~~Skill `display_title` 変更検出のロジック不備~~ ✅ Fixed

- **場所**: `src/execute/planner.ts:70-73`
- **問題**: `resolvedConfigs.get(key)` は Agent 用の resolved config しか格納しない（`resolveFileRefs` は agents ブロックのみを処理）。Skill の `display_title` は resolve されないため `oldTitle` は常に `undefined` になり、title 変更の destroy + create が実行されない。
- **仕様**: operations.md に「display_title change → delete + create」と明記
- **修正案**: State から前回の display_title を取得して比較するか、resolvedConfigs に skill の情報も格納する

### 1.4 [MEDIUM] ~~`resource_ref` が文字列に埋め込まれた場合に Apply で未解決~~ ✅ Fixed

- **場所**: `src/execute/planner.ts:197` / `src/apply/applier.ts:88`
- **問題**: `resolveStringWithExprs` は `resource_ref` が単独の場合のみ `__expr` マーカーを返す。`"prefix ${skill.x.id} suffix"` のようにテキストと混在する場合は `${skill.x.id}` という文字列リテラルに変換され、Apply 時の `deepResolveRefs` で検出・解決されない。
- **仕様**: config_spec.md に「Can be embedded within strings」と明記
- **修正案**: 混在テンプレートの resource_ref 部分を Apply 時に解決できる仕組みが必要

### 1.5 [LOW] ~~`destroy` コマンドの DAG 未使用~~ ✅ Fixed

- **場所**: `src/index.ts:116-128`
- **問題**: `runDestroy` は型名のハードコードされた順序 (`["agent", "skill", "environment"]`) で destroy を生成している。仕様では DAG の逆順を使うとされているが、現時点のリソース構成では正しい。ただし将来 Environment → Skill の依存が導入された場合に破綻する。
- **修正案**: DAG は config がなくても state から構築するか、現在の実装で十分かを判断して仕様を更新する

---

## 2. Design Issues / 設計上の問題

### 2.1 [MEDIUM] ~~SDK 型の `unknown` キャスト多用~~ ✅ Partially Fixed

- **場所**: `src/api/sdk-client.ts` 全体
- **問題**: `this.client.beta as unknown as { ... }` で型を手動でキャストしていた。SDK のバージョンアップで API シグネチャが変わった場合にコンパイルエラーが出ない。
- **対応**: SDK を 0.52.0 → 0.90.0 にアップデートし、beta API の公式型定義を利用するよう書き換え。返り値の型は SDK が保証するようになった。
- **残課題**: `ApiClient` interface が `Record<string, unknown>` を受け取る設計のため、SDK メソッド呼び出し時に params の `as unknown as XxxParams` キャストが3箇所残る。Apply Layer が動的に params を組み立てる（`deepResolveRefs`）ためコンパイル時に具体型が確定しない。将来的にリソースタイプごとに型付き params builder を導入すれば除去可能。

### 2.2 [LOW] ~~`parseState` にバリデーションがない~~ ✅ Fixed

- **場所**: `src/state/store.ts:7-9`
- **問題**: `JSON.parse` の結果をそのまま `StateFile` に型キャストしている。手動編集やバージョン不整合があった場合に無言で壊れたデータを読み込む。
- **改善案**: State にも Zod スキーマを定義するか、少なくとも `version` フィールドのチェックを行う。

### 2.3 [LOW] ~~`injectResourceRefs` がスタブ~~ ✅ Fixed

- **場所**: `src/execute/planner.ts:210-216`
- **問題**: 引数を受け取るだけで何もしないスタブ関数。Plan 時に既存リソースの参照を解決する役割だが未実装。
- **影響**: Plan 表示時に既存リソースの参照値が表示されない（`(pending)` のまま）。Apply 時には `deepResolveRefs` で正しく解決されるため動作上は問題ないが、仕様では「既存リソースは Plan 時に解決」とされている。

### 2.4 [LOW] ~~FileSystem エラーハンドリング~~ ✅ Fixed

- **場所**: `src/fs/local.ts`
- **問題**: `readFile` / `readDirectory` が例外をそのまま throw する。ユーザーフレンドリーなエラーメッセージ（例: "File not found: ./prompts/missing.md referenced in agents.bot.system"）が出ない。

---

## 3. Test Coverage Gaps

### 未実装テスト (TODO.md に記載済み)

| ID   | 内容                                    | 重要度 |
|------|-----------------------------------------|--------|
| X-5  | Skill display_title 変更 → destroy + create | High (バグ 1.3 の修正後に追加) |
| A-2  | Environment update                      | Medium |
| A-7  | Agent update (version 含む)             | Medium |
| R-1  | 既存リソース参照解決                    | Medium |
| S-1  | Create 後の State エントリ確認          | Low    |
| S-2  | Agent update 後の version increment     | Medium |
| S-3  | Skill create_version 後の latest_version | Low    |
| S-4  | Destroy 後の State エントリ削除         | Low    |
| RT-* | リトライロジック全般                    | Medium |
| E2E  | シナリオテスト (S-1 ~ S-7)             | High   |

### テストで検証されていない重要なパス

- `runDestroy` の end-to-end 動作 (logical_name が空なのでおそらく壊れている)
- 複数リソースが相互参照する場合の apply 順序
- State ファイルが破損している場合の挙動

---

## 4. Code Quality

### 良い点

- 3 層の責務分離が明確で、各層が interface で疎結合
- Immutable な State 更新パターン（関数型スタイル）
- DAG によるトポロジカルソートが正しく実装
- Zod による入力バリデーションが網羅的
- Expression パーサーのエッジケース対応（ハイフン付き名前、複数式）
- テストが仕様 ID に対応付けられていて追跡しやすい
- コードがシンプルで読みやすい

### 改善余地

- 型安全性: `Record<string, unknown>` の多用でコンパイル時チェックが弱い箇所がある
- エラーメッセージ: ユーザー向けのコンテキスト情報が不足（どのリソースのどのフィールドでエラーが発生したか）
- CLI の引数パース: 現状 `process.argv[2]` のみ。`--config`, `--state` オプション未対応（Phase 2 だが構造は準備しておくとよい）

---

## 5. Security

- **API Key**: `SdkApiClient` は `ANTHROPIC_API_KEY` 環境変数経由（SDK デフォルト）。State ファイルに API Key が漏洩するパスはない。
- **File Read**: `${file(...)}` は basePath からの相対パスで解決されるが、`../../../etc/passwd` のようなパストラバーサルの防御がない。信頼できる入力前提であれば問題ないが、共有環境での利用を想定する場合は basePath 外へのアクセスを制限すべき。
- **State File**: 認証情報は含まないが、リソース ID が含まれる。gitignore 推奨を README に記載するとよい。

---

## 6. Action Items (優先順)

1. **[P0]** `computeQuickHash` → `computeHash` に統一 (Bug 1.1)
2. **[P0]** `logical_name` を正しく設定 (Bug 1.2)
3. **[P1]** Skill display_title 変更検出の修正 (Bug 1.3)
4. **[P1]** 文字列埋め込み resource_ref の解決 (Bug 1.4)
5. **[P2]** 不足テスト追加 (X-5, A-2, A-7, R-1, S-2)
6. **[P2]** State パース時のバリデーション追加
7. **[P3]** エラーメッセージ改善
8. **[P3]** ファイルパストラバーサル対策

---

## 7. Overall Assessment

**Grade: B+**

Phase 1 の機能が概ね正しく実装されており、アーキテクチャの品質が高い。ただし Hash 計算の不一致と logical_name のバグは本番利用に影響する致命的な問題であり、修正必須。それ以外のコードは読みやすく、テスト可能な設計になっている。

テストカバレッジの穴は TODO で管理されているのでトラッキングはできているが、特に E2E テストの追加が品質保証の鍵になる。
