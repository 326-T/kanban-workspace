// kw server — コントロールプレーン v0（docs/roadmap.md M0）
// Run lifecycle API（HTTP）+ イベントストリーム（SSE）+ Web UI の配信。
// UI は API の純粋なクライアント（D10）。CLI と同じ RunEvent を流す。

import indexPage from "../web/index.html";
import { RunManager } from "./runs";
import type { RunEvent } from "@kw/shared";

const PORT = Number(process.env.PORT ?? 4646);
const manager = new RunManager(process.cwd());
const enc = new TextEncoder();
const json = (data: unknown, status = 200) => Response.json(data, { status });

Bun.serve({
  port: PORT,
  development: true,
  routes: {
    "/": indexPage as never,

    "/api/runs": {
      GET: () => json(manager.list()),
      POST: async (req: Request) => {
        const body = (await req.json()) as { prompt?: string; dir?: string; model?: string; autoApprove?: boolean };
        if (!body.prompt?.trim()) return json({ error: "prompt required" }, 400);
        try {
          return json(manager.create(body as { prompt: string }), 201);
        } catch (e) {
          return json({ error: String(e) }, 400);
        }
      },
    },

    "/api/runs/:id": (req: Request & { params: { id: string } }) => {
      const run = manager.get(req.params.id);
      return run ? json(run.info()) : json({ error: "not found" }, 404);
    },

    // SSE。Last-Event-ID による再接続時の途中再開に対応（id = イベント index）
    "/api/runs/:id/events": (req: Request & { params: { id: string } }) => {
      const run = manager.get(req.params.id);
      if (!run) return json({ error: "not found" }, 404);
      const last = Number(req.headers.get("last-event-id"));
      const fromIdx = Number.isFinite(last) ? last + 1 : 0;
      let unsub = () => {};
      let ping: ReturnType<typeof setInterval> | undefined;
      const stream = new ReadableStream({
        start(controller) {
          const send = (e: RunEvent, idx: number) =>
            controller.enqueue(enc.encode(`id: ${idx}\ndata: ${JSON.stringify(e)}\n\n`));
          unsub = run.subscribe(send, fromIdx);
          ping = setInterval(() => controller.enqueue(enc.encode(`: ping\n\n`)), 15000);
        },
        cancel() {
          unsub();
          if (ping) clearInterval(ping);
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    },

    "/api/runs/:id/messages": {
      POST: async (req: Request & { params: { id: string } }) => {
        const run = manager.get(req.params.id);
        if (!run) return json({ error: "not found" }, 404);
        const { text } = (await req.json()) as { text?: string };
        if (!text?.trim()) return json({ error: "text required" }, 400);
        run.postMessage(text);
        return json(run.info());
      },
    },

    "/api/runs/:id/end": {
      POST: (req: Request & { params: { id: string } }) => {
        const run = manager.get(req.params.id);
        if (!run) return json({ error: "not found" }, 404);
        run.end();
        return json(run.info());
      },
    },

    "/api/runs/:id/permissions/:requestId": {
      POST: async (req: Request & { params: { id: string; requestId: string } }) => {
        const run = manager.get(req.params.id);
        if (!run) return json({ error: "not found" }, 404);
        const { allow } = (await req.json()) as { allow?: boolean };
        const ok = run.decidePermission(req.params.requestId, allow === true);
        return ok ? json(run.info()) : json({ error: "no matching pending permission" }, 409);
      },
    },
  },
  fetch() {
    return new Response("not found", { status: 404 });
  },
});

console.log(`kw server: http://localhost:${PORT}  (sandbox backend: none — 開発モード・隔離なし)`);
