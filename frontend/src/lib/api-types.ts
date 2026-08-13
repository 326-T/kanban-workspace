// backend（Kotlin）の API 表現。backend/src/main/kotlin/kw/core/Model.kt に対応する。
// RunEvent の語彙は runner 側が持つため、そちらは @kw/protocol から型のみ参照する。

export type RunState = "running" | "waiting_input" | "completed" | "failed";

export type User = {
  name: string;
  role: string;
  createdAt: string;
};

export type Resource = {
  name: string;
  kind: "repo";
  path: string;
  tags: string[];
  createdAt: string;
};

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
  engine: string;
  model?: string;
  state: RunState;
  costUsd?: number;
  autoApprove: boolean;
  createdAt: string;
  pendingPermission?: PendingPermission;
  repo?: string;
  branch?: string;
  launchedBy: string;
  /** 成果物レビュー関門の結果。未レビューは undefined */
  reviewState?: "approved" | "rejected";
};

export type DiffFileEntry = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  hunks: string;
};

export type DiffResponse = {
  base: string;
  branch: string;
  files: DiffFileEntry[];
};
