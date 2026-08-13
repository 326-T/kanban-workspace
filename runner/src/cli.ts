#!/usr/bin/env bun
// kw — kanban-workspace CLI v0（docs/roadmap.md M0）
// Run を起動し、イベントを表示しながら対話・承認する最初のクライアント。

import { parseArgs } from "node:util";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { claudeAdapter } from "./adapters/claude";
import { now, type EngineAdapter } from "./adapter";
import type { RunEvent } from "./protocol/events";

const HELP = `kw — kanban-workspace CLI v0

Usage:
  kw run [options] "<prompt>"

Options:
  --engine <name>   エンジン (claude)         [default: claude]
  --dir <path>      作業ディレクトリ          [default: .]
  --model <model>   モデル指定（省略時はエンジン既定）
  --yes             権限要求を自動承認
  --once            1ターンで終了（対話プロンプトを出さない）
  --help            このヘルプ

対話モードでは各ターン終了後に "you>" で続きの指示を入力。
空行 / "/q" で終了。イベントは .kw/runs/<runId>.jsonl に追記される。
`;

const isTTY = stdout.isTTY === true;
const c = {
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
};

function short(v: unknown, n = 160): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function render(e: RunEvent) {
  switch (e.type) {
    case "run_started":
      console.log(c.bold(`● ${e.runId}`) + c.dim(` engine=${e.engine} cwd=${e.cwd} sandbox=${e.sandbox}`));
      break;
    case "assistant_message":
      console.log(`⏺ ${e.text}`);
      break;
    case "tool_request":
      console.log(c.dim(`⚙ ${e.tool} ${short(e.input)}`));
      break;
    case "tool_result":
      console.log((e.isError ? c.red : c.dim)(`  ↳ ${short(e.summary)}`));
      break;
    case "permission_decision":
      console.log(e.allowed ? c.green("  ✓ 許可") : c.red("  ✗ 却下"));
      break;
    case "turn_completed":
      console.log(c.dim(`— turn 完了 (turns=${e.turns}, cost=$${e.costUsd?.toFixed(4) ?? "?"})`));
      break;
    case "completed":
      console.log(
        c.green(`✔ 完了`) +
          c.dim(
            ` turns=${e.turns} · in ${e.usage?.inputTokens ?? "?"} / out ${e.usage?.outputTokens ?? "?"} tokens · $${e.costUsd?.toFixed(4) ?? "?"}`,
          ),
      );
      break;
    case "failed":
      console.log(c.red(`✖ 失敗: ${e.error}`));
      break;
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      engine: { type: "string", default: "claude" },
      dir: { type: "string", default: "." },
      model: { type: "string" },
      yes: { type: "boolean", default: false },
      once: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals[0] !== "run" || positionals.length < 2) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const engines: Record<string, EngineAdapter> = { claude: claudeAdapter };
  const adapter = engines[values.engine!];
  if (!adapter) {
    console.error(`unknown engine: ${values.engine}（対応: ${Object.keys(engines).join(", ")}。codex は M1 で追加予定）`);
    process.exit(1);
  }

  const runId = "r_" + randomUUID().slice(0, 8);
  const cwd = resolve(values.dir!);
  mkdirSync(cwd, { recursive: true });

  const logDir = join(process.cwd(), ".kw", "runs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${runId}.jsonl`);

  const rl = readline.createInterface({ input: stdin, output: stdout });

  // 行キュー：エージェント作業中に届いた入力（先行入力・パイプ入力）を
  // 捨てずに積んでおき、プロンプトを出すタイミングで取り出す
  const lineQueue: string[] = [];
  const lineWaiters: Array<(line: string | null) => void> = [];
  let stdinClosed = false;
  rl.on("line", (line) => {
    const w = lineWaiters.shift();
    if (w) w(line);
    else lineQueue.push(line);
  });
  rl.on("close", () => {
    stdinClosed = true;
    for (const w of lineWaiters.splice(0)) w(null);
  });
  const nextLine = (promptText: string): Promise<string | null> => {
    if (lineQueue.length > 0) return Promise.resolve(lineQueue.shift()!);
    if (stdinClosed) return Promise.resolve(null);
    stdout.write(promptText);
    return new Promise((res) => lineWaiters.push(res));
  };

  const emit = (e: RunEvent) => {
    appendFileSync(logPath, JSON.stringify(e) + "\n");
    render(e);
  };

  console.log(c.yellow(`[warn] sandbox backend: none（開発モード・隔離なし。本番は Linux + bwrap）`));
  emit({ type: "run_started", runId, engine: adapter.name, cwd, sandbox: "none", model: values.model, ts: now() });

  const io = {
    emit,
    requestPermission: async (tool: string, input: unknown, title?: string) => {
      const label = title ?? `${tool}: ${short(input)}`;
      if (values.yes) {
        console.log(c.yellow(`🔓 自動承認 (--yes): ${label}`));
        return { allowed: true, by: "auto" };
      }
      const ans = await nextLine(c.bold(`🔐 ${label}\n   許可しますか? [y/N] `));
      // EOF は fail-closed
      return { allowed: ans !== null && ans.trim().toLowerCase().startsWith("y"), by: "launcher" };
    },
    nextUserMessage: async (): Promise<string | null> => {
      if (values.once) return null;
      const line = await nextLine(c.bold("you> "));
      if (line === null) return null; // EOF（パイプ入力の終端など）
      const t = line.trim();
      if (t === "" || t === "/q" || t === "/quit" || t === "exit") return null;
      return t;
    },
  };

  try {
    await adapter.launch({ runId, cwd, prompt: positionals.slice(1).join(" "), model: values.model }, io);
  } catch (err) {
    emit({ type: "failed", error: err instanceof Error ? err.message : String(err), ts: now() });
    process.exitCode = 1;
  } finally {
    rl.close();
  }

  console.log(c.dim(`log: ${logPath}`));
  process.exit(process.exitCode ?? 0);
}

main();
