import { useEffect, useRef, useState } from "react";
import type { RunEvent } from "@kw/shared";

type RunInfo = {
  id: string;
  prompt: string;
  cwd: string;
  state: "running" | "waiting_input" | "completed" | "failed";
  costUsd?: number;
  autoApprove: boolean;
  createdAt: string;
  pendingPermission?: { requestId: string; tool: string; title?: string; inputPreview: string };
};

const jsonHeaders = { "content-type": "application/json" };
const api = {
  list: (): Promise<RunInfo[]> => fetch("/api/runs").then((r) => r.json()),
  create: (body: unknown): Promise<RunInfo> =>
    fetch("/api/runs", { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) }).then((r) => r.json()),
  send: (id: string, text: string) =>
    fetch(`/api/runs/${id}/messages`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ text }) }),
  end: (id: string) => fetch(`/api/runs/${id}/end`, { method: "POST" }),
  decide: (id: string, requestId: string, allow: boolean) =>
    fetch(`/api/runs/${id}/permissions/${requestId}`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ allow }) }),
};

function short(v: unknown, n = 200): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const stateLabel: Record<RunInfo["state"], string> = {
  running: "実行中",
  waiting_input: "入力待ち",
  completed: "完了",
  failed: "失敗",
};

export function App() {
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [prompt, setPrompt] = useState("");
  const [dir, setDir] = useState("playground");
  const [autoApprove, setAutoApprove] = useState(false);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = () => api.list().then(setRuns).catch(() => {});
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setEvents([]);
    if (!selected) return;
    const es = new EventSource(`/api/runs/${selected}/events`);
    es.onmessage = (m) => setEvents((prev) => [...prev, JSON.parse(m.data) as RunEvent]);
    return () => es.close();
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const run = runs.find((r) => r.id === selected);

  // 未決の permission_request をイベントから導出（SSE なので即時）
  const decided = new Set(events.filter((e) => e.type === "permission_decision").map((e) => e.requestId));
  const isPending = (requestId: string) => !decided.has(requestId);

  const createRun = async () => {
    if (!prompt.trim()) return;
    const info = await api.create({ prompt, dir, autoApprove });
    setPrompt("");
    await refresh();
    if (info?.id) setSelected(info.id);
  };

  const send = async () => {
    if (!selected || !draft.trim()) return;
    await api.send(selected, draft);
    setDraft("");
    refresh();
  };

  const renderEvent = (e: RunEvent, i: number) => {
    switch (e.type) {
      case "run_started":
        return (
          <div key={i} className="divider">
            ● run 開始 — engine={e.engine} / cwd={e.cwd} / sandbox={e.sandbox}
          </div>
        );
      case "assistant_message":
        return (
          <div key={i} className="msg">
            {e.text}
          </div>
        );
      case "tool_request":
        return (
          <div key={i} className="tool">
            ⚙ {e.tool} {short(e.input, 160)}
          </div>
        );
      case "tool_result":
        return (
          <div key={i} className={"tool" + (e.isError ? " err" : "")}>
            ↳ {short(e.summary, 160)}
          </div>
        );
      case "permission_request": {
        const pending = isPending(e.requestId) && selected;
        return (
          <div key={i} className="perm">
            <div className="t">🔐 {e.title ?? `${e.tool} の実行許可`}</div>
            <div className="i">
              {e.tool}: {short(e.input)}
            </div>
            {pending ? (
              <div className="btns">
                <button onClick={() => api.decide(selected!, e.requestId, true)}>許可</button>
                <button className="deny" onClick={() => api.decide(selected!, e.requestId, false)}>
                  却下
                </button>
              </div>
            ) : null}
          </div>
        );
      }
      case "permission_decision":
        return (
          <div key={i} className="tool">
            {e.allowed ? "✓ 許可" : "✗ 却下"}（{e.by}）
          </div>
        );
      case "turn_completed":
        return (
          <div key={i} className="divider">
            — turn 完了 · ${e.costUsd?.toFixed(4) ?? "?"}
          </div>
        );
      case "completed":
        return (
          <div key={i} className="banner ok">
            ✔ 完了 — turns={e.turns} · in {e.usage?.inputTokens ?? "?"} / out {e.usage?.outputTokens ?? "?"} tokens · $
            {e.costUsd?.toFixed(4) ?? "?"}
          </div>
        );
      case "failed":
        return (
          <div key={i} className="banner ng">
            ✖ 失敗: {e.error}
          </div>
        );
      default:
        return null;
    }
  };

  const active = run && (run.state === "running" || run.state === "waiting_input");

  return (
    <div className="app">
      <div className="warnbar">sandbox: none（開発モード・隔離なし。本番は Linux + bwrap）</div>

      <div className="sidebar">
        <div className="brand">
          kanban-workspace
          <small>Run kernel v0 — UI は API の投影（D10）</small>
        </div>

        <div className="newrun">
          <textarea
            rows={3}
            placeholder="エージェントへの指示…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <input type="text" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="作業ディレクトリ" />
          <label className="chk">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
            危険操作を自動承認する
          </label>
          <button onClick={createRun} disabled={!prompt.trim()}>
            ▶ Run 起動
          </button>
        </div>

        <div className="runlist">
          {runs.map((r) => (
            <div key={r.id} className={"runitem" + (r.id === selected ? " sel" : "")} onClick={() => setSelected(r.id)}>
              <div className="row">
                <span>{r.id}</span>
                <span className={"badge " + r.state}>{stateLabel[r.state]}</span>
              </div>
              <div className="p">{r.prompt}</div>
              <div className="cost">
                {r.engine} · ${r.costUsd?.toFixed(4) ?? "0"}
                {r.autoApprove ? " · 自動承認" : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="main">
        {!run ? (
          <div className="empty">Run を起動するか、左のリストから選択してください</div>
        ) : (
          <>
            <div className="timeline">
              {events.map(renderEvent)}
              <div ref={bottomRef} />
            </div>
            <div className="composer">
              <textarea
                placeholder={
                  run.state === "waiting_input"
                    ? "次の指示を入力（Enter で送信 / Shift+Enter で改行）"
                    : run.state === "running"
                      ? "作業中 — 送信すると次のターン境界で届きます"
                      : "この Run は終了しています"
                }
                value={draft}
                disabled={!active}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button onClick={send} disabled={!active || !draft.trim()}>
                送信
              </button>
              <button className="ghost" onClick={() => selected && api.end(selected).then(refresh)} disabled={!active}>
                終了
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
