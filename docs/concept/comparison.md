# 既存製品と差別化

2026-08-10 時点の調査。「カンバン × エージェント」の UX 自体は既に多数存在するが、いずれも**ローカル・単一ユーザ・権限概念なし**であり、本企画の中核（共有可視性・権限・承認）は空白。

## ランドスケープ

| カテゴリ | 製品 | 近い点 / 欠ける点 |
|---|---|---|
| カンバン型 OSS | [Vibe Kanban](https://vibekanban.com/) | 最も近い UX。運営の Bloop が 2026-04 に撤退しコミュニティ運営に。単一ユーザ・権限なし |
| 〃 | [Cline Kanban](https://cline.bot/blog/announcing-kanban)・[kandev](https://skillsllm.com/skill/kandev)・[Agent Kanban](https://agent-kanban.dev/)・[Operator](https://github.com/untra/operator) | 2026 年の新興勢。エージェント非依存・self-host 可のものもあるが、個人の並列作業管理が主眼 |
| ベンダー純正クラウド | Claude Code on the web / Codex cloud / Jules / Copilot coding agent | リモート並列実行は既製。個人セッション単位・エンジン固定・承認体系なし |
| Claude Code 本体 | [Agent Teams](https://code.claude.com/docs/en/agent-teams)（2026-02、実験的） | 複数 Claude セッションの協調。「エージェント同士のチーム」であり「複数の人間 + エージェント」ではない |
| チーム型 SaaS | Devin / Factory | セッションのチーム共有・Playbook（≒テンプレート）など思想は近い。closed・エンジン固定・承認は粗い |
| PM ツール統合 | Linear for Agents / Atlassian Rovo (Jira) | カードにエージェントをアサインする UX は実現済み。実行基盤・権限は各エージェント任せ |
| 部品 | HumanLayer（承認ルーティング API）/ LangGraph interrupt / Temporal | HITL・オーケストレーションの部品として参考になる |

## 結論

「カンバンでエージェントを並列管理」だけなら既製 OSS で足りる。本企画は**権限・承認・共有可視性を最初から中核に据える**ことで差別化する。

- 複数ユーザ共有ボード × FS/MCP 粒度の権限 × 職位ベース承認 × エンジン非依存 × self-host の組み合わせは他にない
- 特に職位ベース承認（職務権限規程のシステム化）は、日本企業向けに強いストーリーになる

## 設計への示唆

- Vibe Kanban 系の worktree 隔離戦略（タスクごとに git worktree を切り並列衝突を防ぐ）は実績があり踏襲候補
- Bloop 撤退が示す通り、単体の「エージェント管理ボード」はビジネスとして厳しい。権限・監査という企業向け価値が本体
