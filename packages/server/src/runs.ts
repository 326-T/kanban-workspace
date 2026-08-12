import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
import { agentGitEnv } from "./git";
import type { ResourceRegistry } from "./resources";
import {
  checkpointCommit,
  prepareDir,
  prepareWorktree,
  type PreparedWorkspace,
} from "./workspaces";

// Run のサーバ側管理（コントロールプレーン v0）。
// CLI と同じ AdapterIO を HTTP/SSE に橋渡しする。
// RunInfo / RunState は @kw/shared で定義し web と共有する。

export type { PendingPermission, RunInfo, RunState } from "@kw/shared";

const engines: Record<string, EngineAdapter> = { claude: claudeAdapter };

function short(v: unknown, n = 200): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

type ManagedRunOptions = {
  id: string;
  prompt: string;
  ws: PreparedWorkspace;
  model?: string;
  engineName: string;
  autoApprove: boolean;
  logPath: string;
  env?: Record<string, string>;
};

class ManagedRun {
  readonly events: RunEvent[] = [];
  private listeners = new Set<(e: RunEvent, idx: number) => void>();
  state: RunState = "running";
  costUsd?: number;
  pendingPermission?: PendingPermission & { resolve: (b: boolean) => void };
  private msgQueue: string[] = [];
  private msgWaiter?: (m: string | null) => void;
  private endRequested = false;
  private finalized = false;
  private lastPermission?: PendingPermission;
  readonly createdAt = now();

  constructor(private opts: ManagedRunOptions) {}

  get id() {
    return this.opts.id;
  }

  start() {
    const { id, prompt, ws, model, engineName, env } = this.opts;
    const adapter = engines[engineName]!;
    this.emit({ type: "run_started", runId: id, engine: engineName, cwd: ws.cwd, sandbox: "none", model, ts: now() });
    if (ws.repo && ws.branch) {
      this.emit({ type: "workspace_prepared", repo: ws.repo, branch: ws.branch, path: ws.cwd, ts: now() });
    }
    adapter
      .launch(
        { runId: id, cwd: ws.cwd, prompt, model, env },
        {
          emit: (e) => this.emit(e),
          requestPermission: (tool, input, title) => this.requestPermission(tool, input, title),
          nextUserMessage: () => this.nextUserMessage(),
        },
      )
      .then(() => {
        this.finalize();
        if (this.state === "running" || this.state === "waiting_input") this.state = "completed";
      })
      .catch((err) => {
        this.emit({ type: "failed", error: err instanceof Error ? err.message : String(err), ts: now() });
        this.finalize();
      });
  }

  // Run 終了時の後始末。repo 管理下なら未コミット変更を checkpoint として保全する
  private finalize() {
    if (this.finalized) return;
    this.finalized = true;
    const { ws, id, engineName, prompt } = this.opts;
    if (!ws.repo) return; // 未管理ディレクトリでは親リポジトリを汚さないため何もしない
    try {
      const c = checkpointCommit(ws.cwd, { runId: id, engine: engineName, prompt });
      if (c) this.emit({ type: "checkpoint_committed", sha: c.sha, summary: c.summary, ts: now() });
    } catch (err) {
      // checkpoint 失敗は Run 自体の失敗にはしない
      console.error(`[${id}] checkpoint commit failed:`, err);
    }
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
    appendFileSync(this.opts.logPath, JSON.stringify(e) + "\n");
    for (const l of this.listeners) l(e, idx);
  }

  private requestPermission(tool: string, input: unknown, title?: string): Promise<boolean> {
    if (this.opts.autoApprove) return Promise.resolve(true);
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
    const { id, prompt, ws, model, engineName, autoApprove } = this.opts;
    return {
      id,
      prompt,
      cwd: ws.cwd,
      model,
      engine: engineName,
      state: this.state,
      costUsd: this.costUsd,
      autoApprove,
      createdAt: this.createdAt,
      pendingPermission: pp
        ? { requestId: pp.requestId, tool: pp.tool, title: pp.title, inputPreview: pp.inputPreview }
        : undefined,
      repo: ws.repo,
      branch: ws.branch,
    };
  }
}

export class RunManager {
  private runs = new Map<string, ManagedRun>();
  private logDir: string;

  constructor(
    private baseDir: string,
    private registry: ResourceRegistry,
  ) {
    this.logDir = join(baseDir, ".kw", "runs");
    mkdirSync(this.logDir, { recursive: true });
  }

  create(opts: {
    prompt: string;
    repo?: string;
    dir?: string;
    model?: string;
    engine?: string;
    autoApprove?: boolean;
  }): RunInfo {
    const engineName = opts.engine ?? "claude";
    if (!engines[engineName]) throw new Error(`unknown engine: ${engineName}`);
    const id = "r_" + randomUUID().slice(0, 8);

    // マウントテーブル v0: repo 指定なら run ブランチの worktree、なければ未管理ディレクトリ
    let ws: PreparedWorkspace;
    if (opts.repo) {
      const res = this.registry.get(opts.repo);
      if (!res) throw new Error(`unknown repo resource: ${opts.repo}`);
      ws = prepareWorktree(this.baseDir, id, res);
    } else {
      ws = prepareDir(opts.dir);
    }

    const run = new ManagedRun({
      id,
      prompt: opts.prompt,
      ws,
      model: opts.model,
      engineName,
      autoApprove: opts.autoApprove ?? false,
      logPath: join(this.logDir, `${id}.jsonl`),
      // Run 内で行われる git 操作はエージェント名義になる（identity の文脈導出）
      env: agentGitEnv(engineName),
    });
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
