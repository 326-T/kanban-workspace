// kw-engine — エンジン呼び出しに特化した軽量 API（D16）
//
// 責務は「Claude / Codex を駆動して RunEvent を SSE で上流に流す」ことだけ。
// ドメイン（ユーザ・リソース・ACL・承認ポリシー）、永続化、UI 配信は
// すべて kw-core（Kotlin）側にある。runId も core が採番する。
//
// このサービスは Agent SDK ↔ CLI の内部プロトコルに触る唯一の場所。

import { EngineRunManager, knownEngines, type LaunchRequest } from "./runs";
import type { RunEvent } from "../protocol/events";

const PORT = Number(process.env.KW_ENGINE_PORT ?? 4647);
const manager = new EngineRunManager();
const enc = new TextEncoder();
const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (e: unknown, status = 400) => json({ error: e instanceof Error ? e.message : String(e) }, status);

Bun.serve({
  port: PORT,
  idleTimeout: 0, // SSE を維持する（core が長時間購読する）
  routes: {
    "/health": () => json({ ok: true, engines: knownEngines(), runs: manager.list().length }),

    "/runs": {
      GET: () => json(manager.list()),
      POST: async (req: Request) => {
        const body = (await req.json()) as LaunchRequest;
        try {
          return json(manager.launch(body), 201);
        } catch (e) {
          return fail(e);
        }
      },
    },

    "/runs/:id": (req: Request & { params: { id: string } }) => {
      const run = manager.get(req.params.id);
      return run ? json(run.status()) : fail(new Error("not found"), 404);
    },

    // RunEvent の SSE。id = seq で Last-Event-ID による途中再開に対応。
    // Run が終了するとストリームを閉じる（core が終了を検知できる）。
    "/runs/:id/events": (req: Request & { params: { id: string } }) => {
      const run = manager.get(req.params.id);
      if (!run) return fail(new Error("not found"), 404);
      // ヘッダ未指定は先頭から。Number(null) === 0 なので null 判定を先に行う
      const lastHeader = req.headers.get("last-event-id");
      const last = lastHeader === null ? Number.NaN : Number(lastHeader);
      const fromSeq = Number.isFinite(last) ? last + 1 : 0;

      let unsub = () => {};
      let ping: ReturnType<typeof setInterval> | undefined;
      const stream = new ReadableStream({
        start(controller) {
          let closed = false;
          const close = () => {
            if (closed) return;
            closed = true;
            if (ping) clearInterval(ping);
            unsub();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          };
          const send = (e: RunEvent, seq: number) => {
            if (closed) return;
            try {
              controller.enqueue(enc.encode(`id: ${seq}\ndata: ${JSON.stringify(e)}\n\n`));
            } catch {
              close();
            }
          };
          unsub = run.subscribe(send, fromSeq, close);
          ping = setInterval(() => {
            if (!closed) controller.enqueue(enc.encode(": ping\n\n"));
          }, 15000);
        },
        cancel() {
          if (ping) clearInterval(ping);
          unsub();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    },

    "/runs/:id/messages": {
      POST: async (req: Request & { params: { id: string } }) => {
        const run = manager.get(req.params.id);
        if (!run) return fail(new Error("not found"), 404);
        const { text } = (await req.json()) as { text?: string };
        if (!text?.trim()) return fail(new Error("text required"));
        run.postMessage(text);
        return json(run.status());
      },
    },

    // 承認の裁定は core が下し、その結果（誰が判断したか含む）をここへ返す
    "/runs/:id/permissions/:requestId": {
      POST: async (req: Request & { params: { id: string; requestId: string } }) => {
        const run = manager.get(req.params.id);
        if (!run) return fail(new Error("not found"), 404);
        const { allow, by } = (await req.json()) as { allow?: boolean; by?: string };
        const ok = run.decidePermission(req.params.requestId, allow === true, by?.trim() || "unknown");
        return ok ? json(run.status()) : fail(new Error("no matching pending permission"), 409);
      },
    },

    "/runs/:id/end": {
      POST: (req: Request & { params: { id: string } }) => {
        const run = manager.get(req.params.id);
        if (!run) return fail(new Error("not found"), 404);
        run.end();
        return json(run.status());
      },
    },
  },
  fetch: () => json({ error: "not found" }, 404),
});

// 終了済み Run は core が永続化しているので定期的に解放する
setInterval(() => manager.evictTerminal(), 5 * 60 * 1000);

console.log(`kw-engine: http://localhost:${PORT}  engines=[${knownEngines().join(", ")}]  sandbox=none（開発モード）`);
