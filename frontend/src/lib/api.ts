import type { DiffResponse, Resource, RunInfo, User } from "@/lib/api-types";

// コントロールプレーン API の型付きクライアント。
// UI からのサーバアクセスは必ずここを経由する。
// 行為者（acting user）は X-KW-User ヘッダで申告する（D13: 認証なし）。

let actingUser = typeof localStorage !== "undefined" ? (localStorage.getItem("kw-user") ?? "owner") : "owner";

export const getActingUser = () => actingUser;
export const setActingUser = (name: string) => {
  actingUser = name;
  localStorage.setItem("kw-user", name);
};

const req = (path: string, init?: RequestInit) =>
  fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-kw-user": actingUser,
      ...(init?.headers ?? {}),
    },
  });

export type CreateRunInput = {
  prompt: string;
  repo?: string;
  dir?: string;
  model?: string;
  autoApprove?: boolean;
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  listUsers: (): Promise<User[]> => req("/api/users").then((r) => r.json()),

  addUser: (input: { name: string; role?: string }): Promise<User> =>
    req("/api/users", { method: "POST", body: JSON.stringify(input) }).then((r) => jsonOrThrow<User>(r)),

  listResources: (): Promise<Resource[]> => req("/api/resources").then((r) => r.json()),

  addResource: (input: { name: string; path: string; tags?: string[] }): Promise<Resource> =>
    req("/api/resources", { method: "POST", body: JSON.stringify(input) }).then((r) => jsonOrThrow<Resource>(r)),

  listRuns: (): Promise<RunInfo[]> => req("/api/runs").then((r) => r.json()),

  createRun: (input: CreateRunInput): Promise<RunInfo> =>
    req("/api/runs", { method: "POST", body: JSON.stringify(input) }).then((r) => jsonOrThrow<RunInfo>(r)),

  sendMessage: (id: string, text: string) =>
    req(`/api/runs/${id}/messages`, { method: "POST", body: JSON.stringify({ text }) }),

  endRun: (id: string) => req(`/api/runs/${id}/end`, { method: "POST" }),

  decidePermission: (id: string, requestId: string, allow: boolean) =>
    req(`/api/runs/${id}/permissions/${requestId}`, { method: "POST", body: JSON.stringify({ allow }) }),

  getDiff: (id: string): Promise<DiffResponse> =>
    req(`/api/runs/${id}/diff`).then((r) => jsonOrThrow<DiffResponse>(r)),

  review: (id: string, approve: boolean, comment?: string): Promise<RunInfo> =>
    req(`/api/runs/${id}/review`, { method: "POST", body: JSON.stringify({ approve, comment }) }).then((r) =>
      jsonOrThrow<RunInfo>(r),
    ),

  eventsUrl: (id: string) => `/api/runs/${id}/events`,
};
