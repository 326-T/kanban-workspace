package kw.core

import java.io.File

private fun env(k: String): String? = System.getenv(k)?.trim()?.ifEmpty { null }

data class Config(
    val port: Int = env("KW_PORT")?.toIntOrNull() ?: 4646,
    val jdbcUrl: String = env("KW_DB_URL") ?: "jdbc:postgresql://localhost:55432/kw",
    val dbUser: String = env("KW_DB_USER") ?: "kw",
    val dbPassword: String = env("KW_DB_PASSWORD") ?: "kw",
    val engineUrl: String = env("KW_ENGINE_URL") ?: "http://localhost:4647",
    /** ビルド済み UI の配信元。存在しなければ静的配信をスキップする */
    val webDir: File = File(env("KW_WEB_DIR") ?: "packages/web/dist"),
    /** worktree・作業領域の置き場 */
    val workDir: File = File(env("KW_WORK_DIR") ?: ".kw"),
    /** repo リソース未指定時の既定作業ディレクトリ */
    val defaultDir: String = env("KW_DEFAULT_DIR") ?: "playground",
)
