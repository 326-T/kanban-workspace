// Run のサーバ側状態表現。API（/api/runs）のレスポンス型として
// server / web / cli で共有する。

export type RunState = "running" | "waiting_input" | "completed" | "failed";

export type PendingPermission = {
  requestId: string;
  tool: string;
  title?: string;
  inputPreview: string;
};

export type RunInfo = {
  id: string;
  prompt: string;
  cwd: string;
  model?: string;
  engine: string;
  state: RunState;
  costUsd?: number;
  autoApprove: boolean;
  createdAt: string;
  pendingPermission?: PendingPermission;
};
