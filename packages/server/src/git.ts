import { spawnSync } from "node:child_process";

// git 操作の薄いヘルパ。identity は常に env で明示し、
// 実行環境のグローバル設定（~/.gitconfig）に依存しない（原則: 文脈からの導出）。

export function git(args: string[], env?: Record<string, string>): string {
  const r = spawnSync("git", args, {
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim()}`);
  }
  return r.stdout;
}

// プラットフォーム自身の名義（リポジトリ初期化など）
export function platformGitEnv(): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: "kanban-workspace",
    GIT_AUTHOR_EMAIL: "system@kw.local",
    GIT_COMMITTER_NAME: "kanban-workspace",
    GIT_COMMITTER_EMAIL: "system@kw.local",
  };
}

// エージェント名義（D5: author = 実行主体）。
// Agent 永続 ID の実装（M1）まではエンジン名を暫定の主体名とする。
export function agentGitEnv(engine: string): Record<string, string> {
  const email = `${engine}@agents.kw.local`;
  return {
    GIT_AUTHOR_NAME: engine,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: engine,
    GIT_COMMITTER_EMAIL: email,
  };
}

// HEAD が存在しない（コミット 0 個の）リポジトリに空の first commit を作る
export function ensureHeadCommit(repoPath: string): void {
  try {
    git(["-C", repoPath, "rev-parse", "--verify", "HEAD"]);
  } catch {
    git(["-C", repoPath, "commit", "--allow-empty", "-m", "first commit"], platformGitEnv());
  }
}
