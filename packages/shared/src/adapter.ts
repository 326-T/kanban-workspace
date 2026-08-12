import type { RunEvent } from "./events";

export type RunSpec = {
  runId: string;
  cwd: string;
  prompt: string;
  model?: string;
  // Run プロセスに注入する追加環境変数（git identity の文脈導出などに使う）
  env?: Record<string, string>;
  // 権限コンパイラ（D14）の出力。allow/ask は settings、
  // 覆せない下限 deny は managedSettings に載せてエンジンへ注入する
  settings?: unknown;
  managedSettings?: unknown;
};

// 承認の結果。by は実際に判断した主体（自動承認は "auto"）
export type PermissionDecision = { allowed: boolean; by: string };

export type AdapterIO = {
  emit: (e: RunEvent) => void;
  // 危険操作の承認。承認ルーティング（上長エスカレーション）は M1
  requestPermission: (tool: string, input: unknown, title?: string) => Promise<PermissionDecision>;
  // 次のユーザ入力。null でセッション終了。
  // アダプタがこれを呼ぶタイミング = エンジンがターンを終えて入力待ちになった時
  nextUserMessage: () => Promise<string | null>;
};

export interface EngineAdapter {
  name: string;
  launch(spec: RunSpec, io: AdapterIO): Promise<void>;
}

export const now = () => new Date().toISOString();
