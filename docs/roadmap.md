# 実装ロードマップ

## 方針：実行基盤ファースト（決定 D10）

差別化の核 — 権限 enforcement・監査・エンジン抽象 — はすべて実行基盤にある。UI は後からどうにでもなる。

規律：**すべての機能はまず API + イベントストリームとして完成させる。Web UI は最後にその投影として作る。最初のクライアントは CLI**。ボード / カードの詳細データモデル設計も M2 まで保留する。

## M0：Run カーネル

ゴール：Web UI なしで、1 つの Run を安全に起動・監視・承認・完了できる。

含むもの：

- **Control plane**（bun + Postgres）：Run lifecycle API、append-only イベントログ
- **Runner**：Run ごとのサンドボックス付きプロセス起動・回収（bwrap / Seatbelt、Docker 非依存）、マウントテーブル v0（repo rw = カードブランチの worktree / ro チェックアウト / scratch）
- **Claude アダプタ**（Agent SDK）：RunEvent への正規化、`permission_request` / `question` の露出
- **クレデンシャルプロキシ v0**：Anthropic キーをプラットフォーム側で保持し、Run にはプロキシエンドポイントのみ渡す。利用量を Run / 主体単位で記録（D9）
- **CLI**：`run start` / `run attach`（イベント stream + 質問応答・承認）/ `run ls` / `run log`
- コミット規約 v0：author = エージェント名義、Run trailer（[workspace/identity.md](workspace/identity.md)）

**含まないもの**：Web UI・ボード・MCP ゲートウェイ・組織木 / 承認ルーティング（承認は起動者本人のみ）・hooks・Codex・shared-volume・ローカル LLM

Exit criteria（このデモが通ること）：

```
kw repo add demo ./some-repo
kw run start --template coder --repo demo "README の typo を直して"
kw run attach <id>     # イベントが流れ、permission_request に y/n で応答できる
kw run log <id>        # イベントログから来歴を再構成できる
git -C ./some-repo log # author = エージェント名義、Run trailer 付きのコミットがある
kw usage               # Run 単位のトークン使用量が見える
```

（`kw` は CLI 名の仮置き）

## M1：統制

- 権限モデルの実装：リソース語彙・ACL・職位ロール・組織木
- MCP ゲートウェイ（ACL 判定・監査・レート制御）
- 承認ルーティング 3 種（CLI の approvals inbox で駆動、[permission/approval.md](permission/approval.md)）
- Codex アダプタ

## M2：協働面

- ボード / カードのデータモデルと Web UI（API の投影として）
- hooks（宣言的ルール）
- テンプレート管理・共有インボックス・引き継ぎ（human Run）

## M0 の実装スタック（PoC 固定、後で差し替え可）

- bun + TypeScript の monorepo：`control-plane` / `adapter-claude` / `cli` / `shared`（型・イベント定義）。ランタイムは bun で確定（D11）
- Postgres は docker compose、Run は OS サンドボックス付きホストプロセス（D12。Run 経路は Docker 非依存）
- API は HTTP + SSE（双方向が必要な箇所のみ WS を検討）
