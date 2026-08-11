import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { claudeAdapter } from "@kw/adapter-claude";
import {
  now,
  type EngineAdapter,
  type PendingPermission,
  type RunEvent,
  type RunInfo,
  type RunState,
} from "@kw/shared";

// Run のサーバ側管理（コントロールプレーン v0）。
// CLI と同じ AdapterIO を HTTP/SSE に橋渡しする。
// RunInfo / RunState は @kw/shared で定義し web と共有する。

export type { PendingPermission, RunInfo, RunState } from "@kw/shared";

const engines: Record<string, EngineAdapter> = { claude: claudeAdapter };

function short(v: unknown, n = 200): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

class ManagedRun {
  readonly events: RunEvent[] = [];
  private listeners = new Set<(e: RunEvent, idx: number) => void>();
  state: RunState = "running";
  costUsd?: number;
  pendingPermission?: PendingPermission & { resolve: (b: boolean) => void };
  private msgQueue: string[] = [];
  private msgWaiter?: (m: string | null) => void;
  private endRequested = false;
  private lastPermission?: PendingPermission;
  readonly createdAt = now();

  constructor(
    readonly id: string,
    readonly prompt: string,
    readonly cwd: string,
    readonly model: string | undefined,
    readonly engineName: string,
    readonly autoApprove: boolean,
    private logPath: string,
  ) {}

  start() {
    const adapter = engines[this.engineName]!;
    this.emit({ type: "run_started", runId: this.id, engine: this.engineName, cwd: this.cwd, sandbox: "none", model: this.model, ts: now() });
    adapter
      .launch(
        { runId: this.id, cwd: this.cwd, prompt: this.prompt, model: this.model },
        {
          emit: (e) => this.emit(e),
          requestPermission: (tool, input, title) => this.requestPermission(tool, input, title),
          nextUserMessage: () => this.nextUserMessage(),
        },
      )
      .then(() => {
        if (this.state === "running" || this.state === "waiting_input") this.state = "completed";
      })
      .catch((err) => {
        this.emit({ type: "failed", error: err instanceof Error ? err.message : String(err), ts: now() });
      });
  }

  private emit(e: RunEvent) {
    // permission_request はアダプタが emit → 直後に requestPermission を呼ぶ。
    // requestId はイベント側にしか無いのでここで捕捉する
    if (e.type === "permission_request") {
      this.lastPermission = { requestId: e.requestId, tool: e.tool, title: e.title, inputPreview: short(e.input) };
    }
    if (e.type === "turn_completed") this.costUsd = e.costUsd ?? this.costUsd;
    if (e.type === "completed") {
      this.state = "completed";
      this.costUsd = e.costUsd ?? this.costUsd;
    }
    if (e.type === "failed") this.state = "failed";
    const idx = this.events.length;
    this.events.push(e);
    appendFileSync(this.logPath, JSON.stringify(e) + "\n");
    for (const l of this.listeners) l(e, idx);
  }

  private requestPermission(tool: string, input: unknown, title?: string): Promise<boolean> {
    if (this.autoApprove) return Promise.resolve(true);
    return new Promise((res) => {
      const p = this.lastPermission ?? {
        requestId: "req_" + randomUUID().slice(0, 8),
        tool,
        title,
        inputPreview: short(input),
      };
      this.pendingPermission = { ...p, resolve: res };
    });
  }

  decidePermission(requestId: string, allow: boolean): boolean {
    if (!this.pendingPermission || this.pendingPermission.requestId !== requestId) return false;
    const { resolve } = this.pendingPermission;
    this.pendingPermission = undefined;
    resolve(allow);
    return true;
  }

  private nextUserMessage(): Promise<string | null> {
    if (this.endRequested) return Promise.resolve(null);
    const queued = this.msgQueue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    this.state = "waiting_input";
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
      this.msgQueue.push(text); // 作業中の先行入力はキューに積み、次のターン境界で届く
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

  subscribe(fn: (e: RunEvent, idx: number) => void, fromIdx = 0): () => void {
    for (let i = fromIdx; i < this.events.length; i++) fn(this.events[i]!, i);
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  info(): RunInfo {
    const pp = this.pendingPermission;
    return {
      id: this.id,
      prompt: this.prompt,
      cwd: this.cwd,
      model: this.model,
      engine: this.engineName,
      state: this.state,
      costUsd: this.costUsd,
      autoApprove: this.autoApprove,
      createdAt: this.createdAt,
      pendingPermission: pp ? { requestId: pp.requestId, tool: pp.tool, title: pp.title, inputPreview: pp.inputPreview } : undefined,
    };
  }
}

export class RunManager {
  private runs = new Map<string, ManagedRun>();
  private logDir: string;

  constructor(baseDir: string) {
    this.logDir = join(baseDir, ".kw", "runs");
    mkdirSync(this.logDir, { recursive: true });
  }

  create(opts: { prompt: string; dir?: string; model?: string; engine?: string; autoApprove?: boolean }): RunInfo {
    const engineName = opts.engine ?? "claude";
    if (!engines[engineName]) throw new Error(`unknown engine: ${engineName}`);
    const id = "r_" + randomUUID().slice(0, 8);
    const cwd = resolve(opts.dir?.trim() || "playground");
    mkdirSync(cwd, { recursive: true });
    const run = new ManagedRun(id, opts.prompt, cwd, opts.model, engineName, opts.autoApprove ?? false, join(this.logDir, `${id}.jsonl`));
    this.runs.set(id, run);
    run.start();
    return run.info();
  }

  get(id: string): ManagedRun | undefined {
    return this.runs.get(id);
  }

  list(): RunInfo[] {
    return [...this.runs.values()].map((r) => r.info()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
