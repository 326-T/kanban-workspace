# エンジンアダプタ

## 方針

Claude / Codex / ローカル LLM を**セッションプロトコル**で抽象化する。ボード・権限・承認はエンジン差を知らない。

## アダプタインターフェース（骨子）

```typescript
interface EngineAdapter {
  launch(run: RunSpec): AsyncIterable<RunEvent>; // 起動しイベントストリームを返す
  respond(runId: string, input: HumanInput): Promise<void>; // 質問応答・承認結果の注入
  interrupt(runId: string): Promise<void>; // 中断
}

type RunEvent =
  | { type: "assistant_message"; text: string }       // 進捗・思考の表示用
  | { type: "permission_request"; tool: ToolCall }    // → 承認ルーティングへ
  | { type: "question"; text: string }                // → カードを Waiting（入力待ち）へ
  | { type: "artifact"; path: string }                // 成果物の申告
  | { type: "completed"; summary: string }
  | { type: "failed"; error: string };
```

各エンジン固有の承認・確認機構を `permission_request` / `question` に**正規化**するのがアダプタの主務。

## 各エンジン

| エンジン | 接続方法（実装時に最新仕様を要確認） | 備考 |
|---|---|---|
| Claude | Claude Agent SDK（TypeScript）。ツール実行の許可コールバックを `permission_request` にマップ | bun 上で直接動かせるため最も密に統合できる。第一実装対象 |
| Codex | codex CLI の headless 実行（JSON ストリーム）。approval policy を最も安全側に設定し、承認をこちらで扱う | Rust バイナリのためサンドボックス内でプロセスとして管理 |
| ローカル LLM | OpenAI 互換エンドポイント（Ollama / vLLM 等） | 下記の 2 経路 |

## ローカル LLM の 2 経路

1. **モデル差し替え**：Claude Code / Codex の API 接続先を互換プロキシ（LiteLLM 等）経由でローカルモデルに向ける。ハーネスの資産をそのまま使えるが、モデル性能がハーネスの前提に届かないと品質が落ちる
2. **自前ミニハーネス**（将来）：OpenAI 互換 API + 最小のツールループを自前実装。deno/bun 上で完結し制御性は最高だが、エージェント品質を自分で作り込むことになる

MVP は経路 1 のみ。アダプタ層があるため経路 2 の追加は後からできる。

## 注意点

- エンジン間で機能は非対称（サブエージェント、hooks、コンテキスト管理など）。プロトコルは**最小公倍数を狙わず**、共通部分（メッセージ・許可・完了）だけを正規化し、固有機能はエンジン固有設定として Template に持たせる
- エンジンの CLI / SDK はバージョン変化が速い。アダプタをパッケージとして分離し、コア（ボード・権限）から依存を切り離す
