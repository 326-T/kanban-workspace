import type { RunEvent } from "./events";

export type RunSpec = {
  runId: string;
  cwd: string;
  prompt: string;
  model?: string;
};

export type AdapterIO = {
  emit: (e: RunEvent) => void;
  // 危険操作の承認。v0 は起動者本人のみ（承認ルーティングは M1）
  requestPermission: (tool: string, input: unknown, title?: string) => Promise<boolean>;
  // 次のユーザ入力。null でセッション終了。
  // アダプタがこれを呼ぶタイミング = エンジンがターンを終えて入力待ちになった時
  nextUserMessage: () => Promise<string | null>;
};

export interface EngineAdapter {
  name: string;
  launch(spec: RunSpec, io: AdapterIO): Promise<void>;
}

export const now = () => new Date().toISOString();
