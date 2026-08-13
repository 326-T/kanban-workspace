package kw.core

import org.jooq.DSLContext
import org.jooq.JSONB
import org.jooq.impl.DSL
import java.math.BigDecimal
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private val ROLES = listOf("メンバー", "課長", "部長")
private val NAME_RE = Regex("^[\\w.-]{1,32}$")
private val RESOURCE_RE = Regex("^[a-zA-Z0-9][\\w-]*$")

class UserRepo(private val dsl: DSLContext) {

    /** 初回起動時のシード。オーナーは最上位ロールにしておく */
    fun seed() {
        if (list().isEmpty()) {
            dsl.insertInto(Users.TABLE).set(Users.NAME, "owner").set(Users.ROLE, "部長").execute()
        }
    }

    fun list(): List<User> =
        dsl.select(Users.NAME, Users.ROLE, Users.CREATED_AT)
            .from(Users.TABLE)
            .orderBy(Users.CREATED_AT)
            .fetch()
            .toList()
            .map { User(it.get(Users.NAME), it.get(Users.ROLE), it.get(Users.CREATED_AT).iso()) }

    fun get(name: String): User? = list().firstOrNull { it.name == name }

    fun add(req: CreateUserRequest): User {
        val name = req.name.trim()
        require(NAME_RE.matches(name)) { "invalid user name: $name" }
        val role = req.role?.trim()?.ifEmpty { null } ?: "メンバー"
        require(role in ROLES) { "invalid role: $role（${ROLES.joinToString(" / ")}）" }
        require(get(name) == null) { "user already exists: $name" }
        dsl.insertInto(Users.TABLE).set(Users.NAME, name).set(Users.ROLE, role).execute()
        return get(name)!!
    }
}

class ResourceRepo(private val dsl: DSLContext) {

    fun list(): List<Resource> =
        dsl.select(Resources.NAME, Resources.KIND, Resources.PATH, Resources.TAGS, Resources.CREATED_AT)
            .from(Resources.TABLE)
            .orderBy(Resources.CREATED_AT)
            .fetch()
            .toList()
            .map {
                Resource(
                    name = it.get(Resources.NAME),
                    kind = it.get(Resources.KIND),
                    path = it.get(Resources.PATH),
                    tags = JsonCodec.decodeStringList(it.get(Resources.TAGS).orEmptyJson()),
                    createdAt = it.get(Resources.CREATED_AT).iso(),
                )
            }

    fun get(name: String): Resource? = list().firstOrNull { it.name == name }

    /** repo リソースの登録。git 化されていなければ init + 空の first commit を作る */
    fun add(req: CreateResourceRequest): Resource {
        val name = req.name.trim()
        require(RESOURCE_RE.matches(name)) { "invalid resource name: $name" }
        require(get(name) == null) { "resource already exists: $name" }
        val abs = Git.initRepo(req.path.trim())
        dsl.insertInto(Resources.TABLE)
            .set(Resources.NAME, name)
            .set(Resources.KIND, "repo")
            .set(Resources.PATH, abs)
            .set(Resources.TAGS, JSONB.valueOf(JsonCodec.encodeStringList(req.tags)))
            .execute()
        return get(name)!!
    }
}

class RunRepo(private val dsl: DSLContext) {
    // core が単一の writer なので、Run ごとの連番はメモリ上のカウンタで足りる
    private val seqs = ConcurrentHashMap<String, AtomicInteger>()

    fun insert(row: RunRow) {
        dsl.insertInto(Runs.TABLE)
            .set(Runs.ID, row.id)
            .set(Runs.PROMPT, row.prompt)
            .set(Runs.CWD, row.cwd)
            .set(Runs.ENGINE, row.engine)
            .set(Runs.MODEL, row.model)
            .set(Runs.STATE, row.state.name)
            .set(Runs.AUTO_APPROVE, row.autoApprove)
            .set(Runs.REPO, row.repo)
            .set(Runs.BRANCH, row.branch)
            .set(Runs.LAUNCHED_BY, row.launchedBy)
            .execute()
    }

    fun updateState(id: String, state: RunState, costUsd: Double?) {
        dsl.update(Runs.TABLE)
            .set(Runs.STATE, state.name)
            .set(Runs.COST_USD, costUsd?.let { BigDecimal.valueOf(it) })
            .where(Runs.ID.eq(id))
            .execute()
    }

    fun list(): List<RunRow> =
        dsl.select(
            Runs.ID, Runs.PROMPT, Runs.CWD, Runs.ENGINE, Runs.MODEL, Runs.STATE,
            Runs.COST_USD, Runs.AUTO_APPROVE, Runs.REPO, Runs.BRANCH, Runs.LAUNCHED_BY, Runs.CREATED_AT,
        )
            .from(Runs.TABLE)
            .orderBy(Runs.CREATED_AT.desc())
            .fetch()
            .toList()
            .map {
                RunRow(
                    id = it.get(Runs.ID),
                    prompt = it.get(Runs.PROMPT),
                    cwd = it.get(Runs.CWD),
                    engine = it.get(Runs.ENGINE),
                    model = it.get(Runs.MODEL),
                    state = runCatching { RunState.valueOf(it.get(Runs.STATE)) }.getOrDefault(RunState.failed),
                    costUsd = it.get(Runs.COST_USD).toDoubleOrNull(),
                    autoApprove = it.get(Runs.AUTO_APPROVE) ?: false,
                    repo = it.get(Runs.REPO),
                    branch = it.get(Runs.BRANCH),
                    launchedBy = it.get(Runs.LAUNCHED_BY),
                    createdAt = it.get(Runs.CREATED_AT).iso(),
                )
            }

    fun get(id: String): RunRow? = list().firstOrNull { it.id == id }

    /** append-only。戻り値の seq は UI への SSE の id になる */
    fun append(runId: String, type: String, payload: String, engineSeq: Int? = null): StoredEvent {
        val counter = seqs.computeIfAbsent(runId) { AtomicInteger(dbMaxSeq(runId) + 1) }
        val seq = counter.getAndIncrement()
        dsl.insertInto(RunEvents.TABLE)
            .set(RunEvents.RUN_ID, runId)
            .set(RunEvents.SEQ, seq)
            .set(RunEvents.TYPE, type)
            .set(RunEvents.PAYLOAD, JSONB.valueOf(payload))
            .set(RunEvents.ENGINE_SEQ, engineSeq)
            .execute()
        return StoredEvent(seq, type, payload)
    }

    fun events(runId: String, fromSeq: Int = 0): List<StoredEvent> =
        dsl.select(RunEvents.SEQ, RunEvents.TYPE, RunEvents.PAYLOAD)
            .from(RunEvents.TABLE)
            .where(RunEvents.RUN_ID.eq(runId))
            .and(RunEvents.SEQ.ge(fromSeq))
            .orderBy(RunEvents.SEQ)
            .fetch()
            .toList()
            .map { StoredEvent(it.get(RunEvents.SEQ), it.get(RunEvents.TYPE), it.get(RunEvents.PAYLOAD).orEmptyJson()) }

    private fun dbMaxSeq(runId: String): Int =
        dsl.select(DSL.max(RunEvents.SEQ)).from(RunEvents.TABLE).where(RunEvents.RUN_ID.eq(runId))
            .fetchOne()?.value1() ?: -1

    /** kw-engine 再接続用。まだ engine 由来のイベントが無ければ -1 */
    fun maxEngineSeq(runId: String): Int =
        dsl.select(DSL.max(RunEvents.ENGINE_SEQ)).from(RunEvents.TABLE).where(RunEvents.RUN_ID.eq(runId))
            .fetchOne()?.value1() ?: -1
}
