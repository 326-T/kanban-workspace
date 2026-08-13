package kw.backend

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.slf4j.LoggerFactory
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Run のオーケストレーション（D16 の core 側本体）。
 *
 * 1. worktree を用意し（マウントテーブル v0）
 * 2. kw-engine に Run を投げ
 * 3. engine の SSE を購読してイベントを Postgres に永続化し
 * 4. UI へは EventBus 経由で再投影し
 * 5. 終了時に checkpoint コミットを打つ
 *
 * 派生状態（state / cost / 承認待ち）は必ず applyEvent を通して作る。
 * ライブ購読と再水和で同じコードを通るため、状態の作り方が一つになる。
 */
class RunService(
    private val cfg: Config,
    private val runs: RunRepo,
    private val resources: ResourceRepo,
    private val engine: EngineClient,
    private val bus: EventBus,
) {
    private val log = LoggerFactory.getLogger(RunService::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val runtimes = ConcurrentHashMap<String, Runtime>()

    private class Runtime(val row: RunRow, val ws: Workspace) {
        @Volatile var state: RunState = RunState.running
        @Volatile var costUsd: Double? = null
        @Volatile var pending: PendingPermission? = null
        @Volatile var lastEngineSeq: Int = -1
        @Volatile var finalized: Boolean = false
    }

    // ---- 公開操作 -------------------------------------------------------

    suspend fun create(req: CreateRunRequest, actingUser: String): RunInfo {
        require(req.prompt.isNotBlank()) { "prompt required" }
        val id = "r_" + UUID.randomUUID().toString().replace("-", "").take(8)
        val engineName = req.engine?.trim()?.ifEmpty { null } ?: "claude"

        val ws = withContext(Dispatchers.IO) {
            val repo = req.repo?.trim()?.ifEmpty { null }
            if (repo != null) {
                val res = resources.get(repo) ?: error("unknown repo resource: $repo")
                Git.prepareWorktree(cfg.workDir, id, res.name, res.path)
            } else {
                Git.plainDir(req.dir?.trim()?.ifEmpty { null } ?: cfg.defaultDir)
            }
        }

        val row = RunRow(
            id = id, prompt = req.prompt, cwd = ws.cwd, engine = engineName, model = req.model,
            state = RunState.running, costUsd = null, autoApprove = req.autoApprove,
            repo = ws.repo, branch = ws.branch, launchedBy = actingUser, createdAt = nowIso(),
        )
        withContext(Dispatchers.IO) { runs.insert(row) }
        val rt = Runtime(row, ws).also { runtimes[id] = it }

        // core が発行するライフサイクル／来歴イベント
        emitCore(rt, buildJsonObject {
            put("type", "run_started")
            put("runId", id)
            put("engine", engineName)
            put("cwd", ws.cwd)
            put("sandbox", "none")
            put("launchedBy", actingUser)
            req.model?.let { put("model", it) }
            put("ts", nowIso())
        })
        if (ws.repo != null && ws.branch != null) {
            emitCore(rt, buildJsonObject {
                put("type", "workspace_prepared")
                put("repo", ws.repo)
                put("branch", ws.branch)
                put("path", ws.cwd)
                put("ts", nowIso())
            })
        }

        engine.launch(buildJsonObject {
            put("runId", id)
            put("engine", engineName)
            put("cwd", ws.cwd)
            put("prompt", req.prompt)
            req.model?.let { put("model", it) }
            put("autoApprove", req.autoApprove)
            // Run 内で行われる git 操作はエージェント名義になる（identity の文脈導出）
            put("env", buildJsonObject { Git.agentEnv(engineName).forEach { (k, v) -> put(k, v) } })
            // B6 でここに権限コンパイラの出力（settings / managedSettings）を載せる
        })

        scope.launch { consumeLoop(rt) }
        return info(rt)
    }

    suspend fun postMessage(id: String, text: String, actingUser: String): RunInfo? {
        val rt = runtimes[id] ?: return null
        engine.message(id, text)
        // 人間の発話も来歴として記録する（誰が言ったか含む）
        emitCore(rt, buildJsonObject {
            put("type", "input_received")
            put("text", text)
            put("by", actingUser)
            put("ts", nowIso())
        })
        return info(rt)
    }

    /** 承認の裁定。permission_decision イベントは engine（アダプタ）側が発行する */
    suspend fun decide(id: String, requestId: String, allow: Boolean, actingUser: String): Boolean {
        val rt = runtimes[id] ?: return false
        if (rt.pending?.requestId != requestId) return false
        engine.decide(id, requestId, allow, actingUser)
        return true
    }

    suspend fun end(id: String): RunInfo? {
        val rt = runtimes[id] ?: return null
        engine.end(id)
        return info(rt)
    }

    fun info(id: String): RunInfo? =
        runtimes[id]?.let { info(it) } ?: runs.get(id)?.let { row -> toInfo(row, row.state, row.costUsd, null) }

    fun list(): List<RunInfo> = runs.list().map { row ->
        val rt = runtimes[row.id]
        if (rt == null) toInfo(row, row.state, row.costUsd, null)
        else toInfo(row, rt.state, rt.costUsd ?: row.costUsd, rt.pending)
    }

    fun events(id: String, fromSeq: Int): List<StoredEvent> = runs.events(id, fromSeq)

    fun eventFlow(id: String) = bus.flow(id)

    /**
     * 起動時の再水和（O14）。イベントログから派生状態を復元し、
     * engine 上に Run が生きていれば購読を再開、失われていれば failed で閉じる。
     */
    suspend fun rehydrate() {
        val open = runs.list().filter { it.state == RunState.running || it.state == RunState.waiting_input }
        if (open.isEmpty()) return
        log.info("rehydrating {} open run(s)", open.size)
        for (row in open) {
            val rt = Runtime(row, Workspace(row.cwd, row.repo, row.branch))
            withContext(Dispatchers.IO) { runs.events(row.id) }.forEach { e ->
                applyEvent(rt, e.type, JsonCodec.parse(e.payload))
            }
            rt.lastEngineSeq = withContext(Dispatchers.IO) { runs.maxEngineSeq(row.id) }
            runtimes[row.id] = rt

            if (engine.status(row.id) != null) {
                log.info("run {} は engine 上で生存 — seq {} から購読を再開", row.id, rt.lastEngineSeq + 1)
                scope.launch { consumeLoop(rt) }
            } else {
                emitCore(rt, buildJsonObject {
                    put("type", "failed")
                    put("error", "core 再起動時に engine 上の Run が失われていました")
                    put("ts", nowIso())
                })
                finalize(rt)
            }
        }
    }

    // ---- 内部 -----------------------------------------------------------

    private suspend fun consumeLoop(rt: Runtime) {
        var attempts = 0
        while (true) {
            try {
                engine.consume(rt.row.id, rt.lastEngineSeq) { seq, ev -> onEngineEvent(rt, seq, ev) }
                break // ストリームの正常終了 = Run 終了
            } catch (e: Exception) {
                if (rt.state == RunState.completed || rt.state == RunState.failed) break
                attempts++
                val alive = engine.status(rt.row.id) != null
                if (!alive || attempts > 5) {
                    emitCore(rt, buildJsonObject {
                        put("type", "failed")
                        put("error", "engine との接続が失われました: ${e.message}")
                        put("ts", nowIso())
                    })
                    break
                }
                log.warn("run {} の SSE 再接続 ({}回目): {}", rt.row.id, attempts, e.message)
                delay(1000L * attempts)
            }
        }
        finalize(rt)
    }

    private suspend fun onEngineEvent(rt: Runtime, engineSeq: Int, payload: JsonObject) {
        rt.lastEngineSeq = engineSeq
        append(rt, payload, engineSeq)
    }

    private suspend fun emitCore(rt: Runtime, payload: JsonObject) = append(rt, payload, null)

    /** 永続化 → 派生状態の更新 → UI への再投影、の一本道 */
    private suspend fun append(rt: Runtime, payload: JsonObject, engineSeq: Int?) {
        val type = JsonCodec.str(payload, "type") ?: "unknown"
        val encoded = JsonCodec.encode(payload)
        val stored = withContext(Dispatchers.IO) { runs.append(rt.row.id, type, encoded, engineSeq) }
        val before = rt.state to rt.costUsd
        applyEvent(rt, type, payload)
        bus.publish(rt.row.id, stored)
        if (before != (rt.state to rt.costUsd)) {
            withContext(Dispatchers.IO) { runs.updateState(rt.row.id, rt.state, rt.costUsd) }
        }
    }

    private fun applyEvent(rt: Runtime, type: String, p: JsonObject) {
        when (type) {
            "awaiting_input" -> rt.state = RunState.waiting_input
            "input_received" -> rt.state = RunState.running
            "permission_request" -> {
                val requestId = JsonCodec.str(p, "requestId") ?: return
                rt.pending = PendingPermission(
                    requestId = requestId,
                    tool = JsonCodec.str(p, "tool") ?: "unknown",
                    title = JsonCodec.str(p, "title"),
                    inputPreview = (p["input"]?.toString() ?: "").take(300),
                )
            }
            "permission_decision" -> rt.pending = null
            "turn_completed" -> rt.costUsd = JsonCodec.num(p, "costUsd") ?: rt.costUsd
            "completed" -> {
                rt.costUsd = JsonCodec.num(p, "costUsd") ?: rt.costUsd
                rt.state = RunState.completed
            }
            "failed" -> rt.state = RunState.failed
        }
    }

    private suspend fun finalize(rt: Runtime) {
        if (rt.finalized) return
        rt.finalized = true
        // repo 管理下なら未コミット変更を checkpoint として保全する（D5/D6）
        if (rt.ws.repo != null) {
            val cp = withContext(Dispatchers.IO) {
                runCatching {
                    Git.checkpoint(rt.ws.cwd, rt.row.engine, rt.row.id, rt.row.prompt, rt.row.launchedBy)
                }.onFailure { log.warn("checkpoint 失敗 {}: {}", rt.row.id, it.message) }.getOrNull()
            }
            if (cp != null) {
                emitCore(rt, buildJsonObject {
                    put("type", "checkpoint_committed")
                    put("sha", cp.sha)
                    put("summary", cp.summary)
                    put("ts", nowIso())
                })
            }
        }
        if (rt.state != RunState.failed) rt.state = RunState.completed
        rt.pending = null
        withContext(Dispatchers.IO) { runs.updateState(rt.row.id, rt.state, rt.costUsd) }
        log.info("run {} 終了 state={} cost={}", rt.row.id, rt.state, rt.costUsd)
    }

    private fun info(rt: Runtime): RunInfo = toInfo(rt.row, rt.state, rt.costUsd, rt.pending)

    private fun toInfo(row: RunRow, state: RunState, cost: Double?, pending: PendingPermission?) = RunInfo(
        id = row.id, prompt = row.prompt, cwd = row.cwd, engine = row.engine, model = row.model,
        state = state, costUsd = cost, autoApprove = row.autoApprove, createdAt = row.createdAt,
        pendingPermission = pending, repo = row.repo, branch = row.branch, launchedBy = row.launchedBy,
    )
}
