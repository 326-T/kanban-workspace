import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Resource } from "@kw/shared";
import { agentGitEnv, ensureHeadCommit, git } from "./git";

// マウントテーブル v0（docs/workspace/resources.md）。
// 解決済み権限を Run の具体的な作業領域に翻訳する。
// v0 は「repo リソース rw = run/<id> ブランチの worktree」のみ。

export type PreparedWorkspace = {
  cwd: string;
  repo?: string;
  branch?: string;
};

export function prepareWorktree(baseDir: string, runId: string, res: Resource): PreparedWorkspace {
  ensureHeadCommit(res.path);
  const branch = `run/${runId}`;
  const wtRoot = join(baseDir, ".kw", "worktrees");
  mkdirSync(wtRoot, { recursive: true });
  const cwd = join(wtRoot, runId);
  git(["-C", res.path, "worktree", "add", cwd, "-b", branch]);
  return { cwd, repo: res.name, branch };
}

// 未管理ディレクトリ（リソース語彙の外側）。開発用の逃げ道として残す
export function prepareDir(dir?: string): PreparedWorkspace {
  const cwd = resolve(dir?.trim() || "playground");
  mkdirSync(cwd, { recursive: true });
  return { cwd };
}

// Run 終了時の checkpoint コミット（D5/D6: agent 名義 + Run trailer）。
// 未コミットの変更が無ければ何もしない。
export function checkpointCommit(
  cwd: string,
  meta: { runId: string; engine: string; prompt: string; launchedBy?: string },
): { sha: string; summary: string } | null {
  const status = git(["-C", cwd, "status", "--porcelain"]).trim();
  if (!status) return null;

  git(["-C", cwd, "add", "-A"]);
  const title = (meta.prompt.split("\n")[0] ?? "").slice(0, 60);
  const trailers = [`Run: ${meta.runId}`];
  if (meta.launchedBy) trailers.push(`Launched-by: ${meta.launchedBy}`);
  trailers.push("Checkpoint: true");
  const message = `checkpoint: ${title}\n\n${trailers.join("\n")}`;
  git(["-C", cwd, "commit", "-m", message], agentGitEnv(meta.engine));
  const sha = git(["-C", cwd, "rev-parse", "HEAD"]).trim();
  const files = status.split("\n").length;
  return { sha, summary: `${files} file(s)` };
}
