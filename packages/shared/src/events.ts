// Run のイベントストリーム。エンジン差はアダプタがこの形に正規化する
// （docs/runtime/engines.md）。イベントログ v0 は JSONL への追記。

export type Usage = { inputTokens: number; outputTokens: number };

export type RunEvent =
  | { type: "run_started"; runId: string; engine: string; cwd: string; sandbox: string; model?: string; launchedBy?: string; ts: string }
  // マウントテーブル v0 の記録（この Run が見える範囲の監査スナップショット）
  | { type: "workspace_prepared"; repo: string; branch: string; path: string; ts: string }
  // Run 終了時の checkpoint コミット（agent 名義 + Run trailer, docs/workspace/identity.md）
  | { type: "checkpoint_committed"; sha: string; summary: string; ts: string }
  | { type: "assistant_message"; text: string; ts: string }
  | { type: "tool_request"; tool: string; input: unknown; callId?: string; ts: string }
  | { type: "tool_result"; summary: string; isError: boolean; callId?: string; ts: string }
  | { type: "permission_request"; requestId: string; tool: string; input: unknown; title?: string; ts: string }
  | { type: "permission_decision"; requestId: string; allowed: boolean; by: string; ts: string }
  | { type: "turn_completed"; turns: number; usage?: Usage; costUsd?: number; ts: string }
  | { type: "completed"; summary: string; turns: number; usage?: Usage; costUsd?: number; ts: string }
  | { type: "failed"; error: string; ts: string };
