package kw.core

import java.io.File

/**
 * git 操作。identity は常に env で明示し、実行環境のグローバル設定（~/.gitconfig）に
 * 依存しない（原則: アイデンティティは行為の文脈から導出する / docs/workspace/identity.md）。
 */
object Git {

    fun exec(args: List<String>, env: Map<String, String> = emptyMap()): String {
        val pb = ProcessBuilder(listOf("git") + args).redirectErrorStream(true)
        pb.environment().putAll(env)
        val proc = pb.start()
        val out = proc.inputStream.bufferedReader().readText()
        val code = proc.waitFor()
        check(code == 0) { "git ${args.joinToString(" ")} failed: ${out.trim()}" }
        return out
    }

    /** プラットフォーム自身の名義（リポジトリ初期化など） */
    fun platformEnv(): Map<String, String> = identity("kanban-workspace", "system@kw.local")

    /** エージェント名義（D5: author = 実行主体） */
    fun agentEnv(engine: String): Map<String, String> = identity(engine, "$engine@agents.kw.local")

    private fun identity(name: String, email: String) = mapOf(
        "GIT_AUTHOR_NAME" to name,
        "GIT_AUTHOR_EMAIL" to email,
        "GIT_COMMITTER_NAME" to name,
        "GIT_COMMITTER_EMAIL" to email,
    )

    /** repo リソース登録時：未 init なら git init + 空の first commit。絶対パスを返す */
    fun initRepo(path: String): String {
        val dir = File(path).absoluteFile
        dir.mkdirs()
        if (!File(dir, ".git").exists()) exec(listOf("init", dir.path))
        ensureHeadCommit(dir.path)
        return dir.path
    }

    /** HEAD が無い（コミット 0 個の）リポジトリに空の first commit を作る */
    fun ensureHeadCommit(repoPath: String) {
        val hasHead = runCatching { exec(listOf("-C", repoPath, "rev-parse", "--verify", "HEAD")) }.isSuccess
        if (!hasHead) exec(listOf("-C", repoPath, "commit", "--allow-empty", "-m", "first commit"), platformEnv())
    }

    /** マウントテーブル v0：repo rw = run/<runId> ブランチの worktree */
    fun prepareWorktree(workDir: File, runId: String, repoName: String, repoPath: String): Workspace {
        ensureHeadCommit(repoPath)
        val branch = "run/$runId"
        val root = File(workDir, "worktrees").also { it.mkdirs() }
        val cwd = File(root, runId)
        exec(listOf("-C", repoPath, "worktree", "add", cwd.absolutePath, "-b", branch))
        return Workspace(cwd.absolutePath, repoName, branch)
    }

    /** リソース語彙の外側（開発用の逃げ道） */
    fun plainDir(dir: String): Workspace = Workspace(File(dir).absoluteFile.also { it.mkdirs() }.path)

    data class Checkpoint(val sha: String, val summary: String)

    /** Run 終了時の checkpoint コミット（agent 名義 + Run / Launched-by trailer） */
    fun checkpoint(cwd: String, engine: String, runId: String, prompt: String, launchedBy: String): Checkpoint? {
        val status = exec(listOf("-C", cwd, "status", "--porcelain")).trim()
        if (status.isEmpty()) return null
        exec(listOf("-C", cwd, "add", "-A"))
        val title = prompt.lineSequence().firstOrNull()?.take(60).orEmpty()
        val message = """
            checkpoint: $title

            Run: $runId
            Launched-by: $launchedBy
            Checkpoint: true
        """.trimIndent()
        exec(listOf("-C", cwd, "commit", "-m", message), agentEnv(engine))
        val sha = exec(listOf("-C", cwd, "rev-parse", "HEAD")).trim()
        return Checkpoint(sha, "${status.lines().size} file(s)")
    }
}
