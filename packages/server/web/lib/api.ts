import type { Resource, RunInfo } from "@kw/shared";

// コントロールプレーン API の型付きクライアント。
// UI からのサーバアクセスは必ずここを経由する。

const jsonHeaders = { "content-type": "application/json" };

export type CreateRunInput = {
  prompt: string;
  repo?: string;
  dir?: string;
  model?: string;
  autoApprove?: boolean;
};

export const api = {
  listResources: (): Promise<Resource[]> => fetch("/api/resources").then((r) => r.json()),

  addResource: async (input: { name: string; path: string; tags?: string[] }): Promise<Resource> => {
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "登録に失敗しました");
    return body as Resource;
  },

  listRuns: (): Promise<RunInfo[]> => fetch("/api/runs").then((r) => r.json()),

  createRun: (input: CreateRunInput): Promise<RunInfo> =>
    fetch("/api/runs", { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) }).then((r) => r.json()),

  sendMessage: (id: string, text: string) =>
    fetch(`/api/runs/${id}/messages`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ text }) }),

  endRun: (id: string) => fetch(`/api/runs/${id}/end`, { method: "POST" }),

  decidePermission: (id: string, requestId: string, allow: boolean) =>
    fetch(`/api/runs/${id}/permissions/${requestId}`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ allow }),
    }),

  eventsUrl: (id: string) => `/api/runs/${id}/events`,
};
