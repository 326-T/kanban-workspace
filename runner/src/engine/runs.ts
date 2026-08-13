import { claudeAdapter } from "../adapters/claude";
import { now, type EngineAdapter, type PermissionDecision } from "../adapter";
import type { RunEvent } from "../protocol/events";

// kw-engine の in-flight Run 管理（D16）。
// 永続化はしない — イベントの真実は kw-core（Postgres）が持ち、
// ここは「エンジンを駆動して RunEvent を SSE で上流に流す」ことに専念する。

const engines: Record<string, EngineAdapter> = { claude: claudeAdapter };

export const knownEngines = () => Object.keys(engines);

export type LaunchRequest = {
  runId: string;
  cwd: string;
  prompt: string;
  engine?: string;
  model?: string;
  env?: Record<string, string>;
  // 権限コンパイラ（D14）の出力。エンジン設定としてそのまま注入する
  settings?: unknown;
  managedSettings?: unknown;
  // core からの委任指示：承認を core に聞かずエンジン側で自動許可する
  autoApprove?: boolean;
};

export type EngineRunStatus = {
  runId: string;
  engine: string;
  state: "running" | "waiting_input" | "completed" | "failed";
  eventCount: number;
  pendingPermission?: { requestId: string; tool: string };
};

function short(v: unknown, n = 200): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

class EngineRun {
  readonly events: RunEvent[] = [];
  private listeners = new Set<(e: RunEvent, seq: number) => void>();
  state: EngineRunStatus["state"] = "running";
  private pending?: { requestId: string; tool: string; resolve: (d: PermissionDecision) => void };
  private lastRequest?: { requestId: string; tool: string };
  private msgQueue: string[] = [];
  private msgWaiter?: (m: string | null) => void;
  private endRequested = false;

  constructor(private readonly req: LaunchRequest) {}

  start() {
    const engineName = this.req.engine ?? "claude";
    const adapter = engines[engineName]!;
    adapter
      .launch(
        {
          runId: this.req.runId,
          cwd: this.req.cwd,
          prompt: this.req.prompt,
          model: this.req.model,
          env: this.req.env,
          settings: this.req.settings,
          managedSettings: this.req.managedSettings,
        },
        {
          emit: (e) => this.emit(e),
          requestPermission: (tool, input, title) => this.requestPermission(tool, input, title),
          nextUserMessage: () => this.nextUserMessage(),
        },
      )
      .then(() => {
        if (this.state !== "failed") this.state = "completed";
        this.closeStreams();
      })
      .catch((err) => {
        this.emit({ type: "failed", error: err instanceof Error ? err.message : String(err), ts: now() });
        this.closeStreams();
      });
  }

  private emit(e: RunEvent) {
    if (e.type === "permission_request") this.lastRequest = { requestId: e.requestId, tool: e.tool };
    if (e.type === "completed") this.state = "completed";
    if (e.type === "failed") this.state = "failed";
    const seq = this.events.length;
    this.events.push(e);
    for (const l of this.listeners) l(e, seq);
  }

  // 終了を購読側（core）に伝えるための番兵。SSE を閉じる
  private closeSignals = new Set<() => void>();

  private closeStreams() {
    for (const c of this.closeSignals) c();
  }

  private requestPermission(tool: string, input: unknown, title?: string): Promise<PermissionDecision> {
    if (this.req.autoApprove) return Promise.resolve({ allowed: true, by: "auto" });
    return new Promise((resolve) => {
      const r = this.lastRequest ?? { requestId: `req_${this.events.length}`, tool };
      this.pending = { ...r, resolve };
    });
  }

  decidePermission(requestId: string, allowed: boolean, by: string): boolean {
    if (!this.pending || this.pending.requestId !== requestId) return false;
    const { resolve } = this.pending;
    this.pending = undefined;
    resolve({ allowed, by });
    return true;
  }

  private nextUserMessage(): Promise<string | null> {
    if (this.endRequested) return Promise.resolve(null);
    const queued = this.msgQueue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    this.state = "waiting_input";
    // 「入力待ちになった」ことをイベントとして残す（core が状態を導出する）
    this.emit({ type: "awaiting_input", ts: now() });
    return new Promise((res) => {
      this.msgWaiter = res;
    });
  }

  postMessage(text: string) {
    if (this.msgWaiter) {
      const w = this.msgWaiter;
      this.msgWaiter = undefined;
      this.state = "running";
      w(text);
    } else {
      // 作業中の先行入力はキューに積み、次のターン境界で届ける
      this.msgQueue.push(text);
    }
  }

  end() {
    this.endRequested = true;
    if (this.msgWaiter) {
      const w = this.msgWaiter;
      this.msgWaiter = undefined;
      w(null);
    }
  }

  subscribe(fn: (e: RunEvent, seq: number) => void, fromSeq: number, onClose: () => void): () => void {
    for (let i = fromSeq; i < this.events.length; i++) fn(this.events[i]!, i);
    if (this.isTerminal()) {
      // 既に終了している Run は再生のみ行って閉じる
      queueMicrotask(onClose);
      return () => {};
    }
    this.listeners.add(fn);
    this.closeSignals.add(onClose);
    return () => {
      this.listeners.delete(fn);
      this.closeSignals.delete(onClose);
    };
  }

  isTerminal() {
    return this.state === "completed" || this.state === "failed";
  }

  status(): EngineRunStatus {
    return {
      runId: this.req.runId,
      engine: this.req.engine ?? "claude",
      state: this.state,
      eventCount: this.events.length,
      pendingPermission: this.pending
        ? { requestId: this.pending.requestId, tool: this.pending.tool }
        : undefined,
    };
  }
}

export class EngineRunManager {
  private runs = new Map<string, EngineRun>();

  launch(req: LaunchRequest): EngineRunStatus {
    if (!req.runId?.trim()) throw new Error("runId required（採番は kw-core の責務）");
    if (!req.cwd?.trim()) throw new Error("cwd required");
    if (!req.prompt?.trim()) throw new Error("prompt required");
    const engineName = req.engine ?? "claude";
    if (!engines[engineName]) throw new Error(`unknown engine: ${engineName}`);
    if (this.runs.has(req.runId)) throw new Error(`run already exists: ${req.runId}`);

    const run = new EngineRun({ ...req, engine: engineName });
    this.runs.set(req.runId, run);
    run.start();
    console.log(`[${req.runId}] launched engine=${engineName} cwd=${req.cwd}${req.autoApprove ? " autoApprove" : ""}`);
    return run.status();
  }

  get(runId: string) {
    return this.runs.get(runId);
  }

  list(): EngineRunStatus[] {
    return [...this.runs.values()].map((r) => r.status());
  }

  // 終了済み Run の掃除（core が永続化済みのため保持不要）
  evictTerminal(): number {
    let n = 0;
    for (const [id, run] of this.runs) {
      if (run.isTerminal()) {
        this.runs.delete(id);
        n++;
      }
    }
    return n;
  }
}

export { short };
