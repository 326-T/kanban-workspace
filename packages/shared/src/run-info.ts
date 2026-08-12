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
  // repo リソース上で実行される Run の場合のみ（worktree マウント）
  repo?: string;
  branch?: string;
};

// ワークスペースのリソース（docs/workspace/resources.md）。
// v0 は repo のみ。フラット名前空間 + タグ。
export type Resource = {
  name: string;
  kind: "repo";
  path: string;
  tags: string[];
  createdAt: string;
};
