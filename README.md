# Kanban Workspace（仮称）

人間と AI エージェントが同じカンバンボードの上で協働する、チーム向けワークスペース。

リモートのマルチエージェント実行基盤に「組織」の構造 — 全員からの可視性・職位・承認 — を与え、カンバンを人間とエージェント共通の作業盤にする。

## コア原則

1. **すべての状態はボードにある** — エージェントの実行状態・入力待ち・承認待ちは全ユーザから見える。隠れたワークフローを作らない
2. **人間とエージェントは同格** — どちらもカードのアサイン先であり、権限の主体である
3. **権限は組織図** — 職位ロール（メンバー / 課長 / 部長）と委任原則で権限を表現し、承認は組織木のエスカレーションとして扱う
4. **エージェントを信頼しない** — 権限の enforcement は FS マウント・MCP ゲートウェイ・API キープロキシの 3 点に集約する
5. **エンジン非依存** — Claude / Codex / ローカル LLM をアダプタで抽象化する
6. **成果物は docs-as-code** — スライドは Marp 等、Office 的成果物もテキストで表現し OSS ツールチェーンでレンダリングする
7. **アイデンティティは文脈から** — 誰の行為かはプラットフォームが行為の文脈（主体 × Run）から導出する。環境のグローバル状態に依存しない。完全な来歴はイベントログが持ち、git はその投影

## 決定済みの方針

| 項目 | 決定 |
|---|---|
| 対象領域 | コーディング〜汎用業務。成果物はコーディングのパラダイム（テキスト + git + diff）で扱う |
| 実行モデル | タスク型実行（Run）＋ 永続エージェント ID |
| 提供形態 | SaaS 志向。当面は 1 組織 = 1 VM のシングルテナント |
| 承認 MVP | 起動時事前承認・危険操作ルーティング・成果物レビュー関門の 3 種すべて |

詳細な経緯と未決事項は [docs/decisions.md](docs/decisions.md) を参照。

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/concept/overview.md](docs/concept/overview.md) | 課題・ビジョン・用語 |
| [docs/concept/comparison.md](docs/concept/comparison.md) | 既存製品と差別化 |
| [docs/board/model.md](docs/board/model.md) | ボードとカードの状態モデル |
| [docs/permission/model.md](docs/permission/model.md) | 権限モデル（主体・資源・職位・委任） |
| [docs/permission/approval.md](docs/permission/approval.md) | 3 種の承認フロー |
| [docs/runtime/architecture.md](docs/runtime/architecture.md) | 実行基盤とデプロイ形態 |
| [docs/runtime/engines.md](docs/runtime/engines.md) | エンジンアダプタとローカル LLM |
| [docs/orchestration/hooks.md](docs/orchestration/hooks.md) | イベントフックと HITL |
| [docs/workspace/artifacts.md](docs/workspace/artifacts.md) | ワークスペースと成果物 |
| [docs/workspace/resources.md](docs/workspace/resources.md) | リソース語彙・タグ・マウントテーブル |
| [docs/workspace/identity.md](docs/workspace/identity.md) | アイデンティティと来歴 |
| [docs/decisions.md](docs/decisions.md) | 決定ログと未決事項 |

## ステータス

設計フェーズ。実装未着手。
