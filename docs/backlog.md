# バックログ

これからやることの起票場所。GitHub Issues は使わず、このファイルで管理する（起票・クローズはコミットとして履歴に残る）。着手時はエントリ先頭に `→ WIP`、完了時は `✅ 完了 (コミット)` を付ける。

**優先方針（2026-08-12）**：まず**ハッピーパス** — 複数ユーザが repo 上でエージェントを起動し、承認・レビューを回して成果物がマージされるまでの一連 — を通す。順序の目安：B6（権限・承認）→ B8（永続化）→ B4（usage）→ B3（CLI）。**B2（bwrap）と B5（Codex）は優先度低**（隔離強化とエンジン追加はハッピーパスの後）。

---

## B1. ~~[M0] クレデンシャルプロキシ v0~~ — 取り下げ（D13）

PoC はシングルテナントで VM 内認証は過剰なため実装しない。モデル認証は実行者の CLI 認証を素通し、従量記録はイベントログ計測（B4）で担う。SaaS 化の際に再起票する。

## B2. [優先度低] bwrap サンドボックスバックエンド — Linux 実行サーバの Run 隔離

**背景**：D12。現状は `none` バックエンド（隔離なし・開発用）のみ。Linux 実行サーバ上で bwrap によるマウントテーブルの enforcement を実装する。

- [ ] Runner のバックエンド抽象（`none` / `bwrap`）を明示的なインターフェースに切り出す
- [ ] マウントテーブル → bwrap の `--bind` / `--ro-bind` / `--tmpfs` 引数への翻訳
- [ ] cgroups（systemd-run）での CPU / メモリ制限
- [ ] Linux VM（実行サーバ想定環境）での動作確認。Anthropic sandbox-runtime の流用可否を評価
- [ ] ネットワーク分離の強度は O12 として継続（v0 は「クレデンシャル不在 + プロキシ経由」まで）

参照：[runtime/architecture.md](runtime/architecture.md) Run の隔離モデル、D12 / O12

## B3. [M0] CLI をコントロールプレーン API クライアント化（repo 対応）

**背景**：CLI は現在スタンドアロン（アダプタ直結）で、リソース登録簿・worktree・checkpoint コミットを経由しない。設計どおり「CLI = API の最初のクライアント」に揃える。

- [ ] `kw repo add <name> <path>` / `kw repo ls`（/api/resources を呼ぶ）
- [ ] `kw run start --repo <name>` / `attach` / `log` をサーバ API + SSE ベースに再実装
- [ ] サーバ未起動時のフォールバック（現行のスタンドアロン実行）を残すか判断
- [ ] 承認・対話は既存の行キュー UI を SSE 経由に接続

参照：[roadmap.md](roadmap.md) M0 exit criteria

## B4. [M0] kw usage — Run / 主体単位の利用量集計

**背景**：exit criteria の残り。イベントログ（turn_completed / completed の usage・cost）から集計できる。

- [ ] `GET /api/usage`（Run 別・期間別の集計）
- [ ] `kw usage` コマンドと UI での表示（サイドバー合計など）
- [ ] B1 のプロキシ計測と整合させる（イベント由来とプロキシ由来の突合）

## B5. [優先度低] Codex アダプタ

**背景**：エンジン非依存（コア原則 5）の実証。アダプタ境界（EngineAdapter / RunEvent）は実装済みなので、2 つ目のエンジンで抽象の妥当性を検証する。

- [ ] `codex exec` headless（JSON ストリーム）のイベントを RunEvent に正規化
- [ ] approval policy を最安全側に設定し、承認をプラットフォーム側で扱う
- [ ] callId 相関・turn 境界・コスト取得のマッピング確認
- [ ] UI / CLI のエンジン選択を有効化

参照：[runtime/engines.md](runtime/engines.md)

## B6. [M1] 権限モデルと承認ルーティング 3 種

**背景**：本企画の差別化の核。現状の承認は起動者本人のみ・リソースは登録制のみで ACL が無い。前提：B9 のユーザ登録簿（実装済み）。

- [ ] 主体（User / Agent）と組織木・職位ロールのモデル実装（B9 のユーザ登録簿を拡張）
- [ ] ACL：リソース語彙（`repo:<name>` + glob、タグセレクタ）× 主体
- [ ] `Run 権限 = Template ∩ 起動者 ∩ カードスコープ` の解決器
- [ ] 承認ルーティング：権限内=自動 / 起動者権限内=本人 / 超過=最小の祖先へエスカレーション
- [ ] 起動時事前承認・成果物レビュー関門（Run ブランチのマージ承認として）
- [ ] タグ付与を権限操作として扱う（承認・監査対象）

参照：[permission/model.md](permission/model.md)、[permission/approval.md](permission/approval.md)、D7 / D8

## B7. [M1] MCP ゲートウェイ v0

**背景**：enforcement 3 チョークポイントの残り 1 つ。全 MCP 通信を中央プロキシ経由にし、ACL 判定・監査・レート制御を一元化する。

- [ ] Run 内 MCP 設定をゲートウェイ経由に固定する仕組み（エンジン側 mcpServers の注入）
- [ ] サーバ / ツール単位の allowlist 判定と監査ログ
- [ ] クレデンシャル（MCP サーバの認証情報）をゲートウェイ側で保持
- [ ] 動的昇格（Run 実行中の権限付与はプロキシ系のみ可）の実装

参照：[permission/model.md](permission/model.md)、[workspace/resources.md](workspace/resources.md) 昇格の非対称性

## B8. [M1] Postgres 移行と Run の再水和（O14）

**背景**：サーバ再起動で in-memory の Run 一覧が消える（イベント JSONL は残るが再構成しない）。アーキテクチャどおり Postgres + append-only イベントログに移す。

- [ ] イベントログを Postgres に永続化（JSONL は開発用エクスポートに格下げ or 併記）
- [ ] 起動時にイベントログから Run 状態を再構成（イベントソーシングの初実装）
- [ ] SSE の Last-Event-ID 再開を DB 由来のインデックスに接続
- [ ] docker compose に Postgres を追加（ローカル完結を維持）

参照：[runtime/architecture.md](runtime/architecture.md)、O14

## B9. ✅ 完了 — ユーザスイッチャ（認証なしのアカウント切替、D13）

**背景**：PoC に認証は邪魔（D13）。ただし承認ルーティング（B6）のデモには「誰として行動しているか」の切替が要る。

- [x] ユーザ登録簿（`.kw/users.json`、名前 + 職位。初回は owner / 部長 をシード）
- [x] `GET/POST /api/users`、行為者は `X-KW-User` ヘッダの申告制
- [x] UI サイドバーにアカウントスイッチャ（切替 + ユーザ追加、localStorage 保持）
- [x] 来歴への記録：run_started / RunInfo の launchedBy、checkpoint コミットの `Launched-by:` trailer、承認イベントの by
