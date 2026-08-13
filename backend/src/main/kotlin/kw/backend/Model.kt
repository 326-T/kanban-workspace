package kw.backend

import kotlinx.serialization.Serializable

// UI（packages/web）と共有する API 表現。フィールド名は @kw/shared の型に一致させる。

@Serializable
enum class RunState { running, waiting_input, completed, failed }

@Serializable
data class User(val name: String, val role: String, val createdAt: String)

@Serializable
data class Resource(
    val name: String,
    val kind: String,
    val path: String,
    val tags: List<String>,
    val createdAt: String,
)

@Serializable
data class PendingPermission(
    val requestId: String,
    val tool: String,
    val title: String? = null,
    val inputPreview: String,
)

@Serializable
data class RunInfo(
    val id: String,
    val prompt: String,
    val cwd: String,
    val engine: String,
    val model: String? = null,
    val state: RunState,
    val costUsd: Double? = null,
    val autoApprove: Boolean,
    val createdAt: String,
    val pendingPermission: PendingPermission? = null,
    val repo: String? = null,
    val branch: String? = null,
    val launchedBy: String,
)

@Serializable data class CreateUserRequest(val name: String, val role: String? = null)

@Serializable
data class CreateResourceRequest(val name: String, val path: String, val tags: List<String> = emptyList())

@Serializable
data class CreateRunRequest(
    val prompt: String,
    val repo: String? = null,
    val dir: String? = null,
    val model: String? = null,
    val engine: String? = null,
    val autoApprove: Boolean = false,
)

@Serializable data class MessageRequest(val text: String)

@Serializable data class DecisionRequest(val allow: Boolean = false)

@Serializable data class ErrorResponse(val error: String)

@Serializable data class Health(val ok: Boolean, val engine: String, val web: Boolean)

/** 永続化済みイベント 1 件。payload は engine 由来の RunEvent JSON をそのまま保持する。 */
data class StoredEvent(val seq: Int, val type: String, val payload: String)

data class Workspace(val cwd: String, val repo: String? = null, val branch: String? = null)

/** kw_runs 行（一覧表示用の非正規化コピー）。 */
data class RunRow(
    val id: String,
    val prompt: String,
    val cwd: String,
    val engine: String,
    val model: String?,
    val state: RunState,
    val costUsd: Double?,
    val autoApprove: Boolean,
    val repo: String?,
    val branch: String?,
    val launchedBy: String,
    val createdAt: String,
)
