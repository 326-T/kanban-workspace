package kw.backend

import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.http.content.staticFiles
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.server.sse.SSE
import io.ktor.server.sse.sse
import io.ktor.sse.ServerSentEvent
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("kw.backend")

/** D13: 認証なしの申告制。行為者はヘッダで宣言する */
private fun ApplicationCall.actingUser(): String =
    request.headers["X-KW-User"]?.trim()?.ifEmpty { null } ?: "owner"

fun main() {
    val cfg = Config()
    log.info("kw-backend 起動: db={} engine={} web={}", cfg.jdbcUrl, cfg.engineUrl, cfg.webDir.absolutePath)

    val dsl = Db.connect(cfg)
    val users = UserRepo(dsl).also { it.seed() }
    val resources = ResourceRepo(dsl)
    val runRepo = RunRepo(dsl)
    val service = RunService(cfg, runRepo, resources, EngineClient(cfg.engineUrl), EventBus())

    runBlocking {
        runCatching { service.rehydrate() }.onFailure { log.warn("再水和に失敗: {}", it.message) }
    }

    embeddedServer(Netty, port = cfg.port) { module(cfg, users, resources, service) }.start(wait = true)
}

fun Application.module(cfg: Config, users: UserRepo, resources: ResourceRepo, service: RunService) {
    install(ContentNegotiation) { json(JsonCodec.json) }
    install(SSE)
    install(StatusPages) {
        exception<IllegalArgumentException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.message ?: "bad request"))
        }
        exception<IllegalStateException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse(cause.message ?: "invalid state"))
        }
        exception<Throwable> { call, cause ->
            log.error("unhandled", cause)
            call.respond(HttpStatusCode.InternalServerError, ErrorResponse(cause.message ?: "internal error"))
        }
    }

    routing {
        route("/api") {
            get("/health") {
                call.respond(Health(ok = true, engine = cfg.engineUrl, web = cfg.webDir.isDirectory))
            }

            get("/users") { call.respond(users.list()) }
            post("/users") {
                call.respond(HttpStatusCode.Created, users.add(call.receive<CreateUserRequest>()))
            }

            get("/resources") { call.respond(resources.list()) }
            post("/resources") {
                call.respond(HttpStatusCode.Created, resources.add(call.receive<CreateResourceRequest>()))
            }

            get("/runs") { call.respond(service.list()) }
            post("/runs") {
                val req = call.receive<CreateRunRequest>()
                call.respond(HttpStatusCode.Created, service.create(req, call.actingUser()))
            }
            get("/runs/{id}") {
                val info = service.info(call.parameters["id"].orEmpty())
                if (info == null) call.respond(HttpStatusCode.NotFound, ErrorResponse("not found"))
                else call.respond(info)
            }
            post("/runs/{id}/messages") {
                val req = call.receive<MessageRequest>()
                require(req.text.isNotBlank()) { "text required" }
                val info = service.postMessage(call.parameters["id"].orEmpty(), req.text, call.actingUser())
                if (info == null) call.respond(HttpStatusCode.NotFound, ErrorResponse("not found"))
                else call.respond(info)
            }
            post("/runs/{id}/permissions/{requestId}") {
                val id = call.parameters["id"].orEmpty()
                val requestId = call.parameters["requestId"].orEmpty()
                val req = call.receive<DecisionRequest>()
                val ok = service.decide(id, requestId, req.allow, call.actingUser())
                if (!ok) call.respond(HttpStatusCode.Conflict, ErrorResponse("no matching pending permission"))
                else call.respond(service.info(id) ?: return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("not found")))
            }
            post("/runs/{id}/end") {
                val info = service.end(call.parameters["id"].orEmpty())
                if (info == null) call.respond(HttpStatusCode.NotFound, ErrorResponse("not found"))
                else call.respond(info)
            }

            // UI へのイベント再投影。真実は Postgres のイベントログで、
            // まず DB から再生し、その後 EventBus のライブ分を seq で重複排除しながら流す。
            sse("/runs/{id}/events") {
                val id = call.parameters["id"] ?: return@sse
                val last = call.request.headers["Last-Event-ID"]?.toIntOrNull()
                    ?: call.request.queryParameters["lastEventId"]?.toIntOrNull()
                val from = (last ?: -1) + 1
                var lastSent = from - 1
                for (e in service.events(id, from)) {
                    send(ServerSentEvent(data = e.payload, id = e.seq.toString()))
                    lastSent = e.seq
                }
                service.eventFlow(id).collect { e ->
                    if (e.seq > lastSent) {
                        send(ServerSentEvent(data = e.payload, id = e.seq.toString()))
                        lastSent = e.seq
                    }
                }
            }
        }

        // ビルド済み UI（packages/web/dist）の静的配信
        if (cfg.webDir.isDirectory) {
            staticFiles("/", cfg.webDir) { default("index.html") }
        } else {
            log.warn("web dist が見つかりません: {}（bun run web:build で生成）", cfg.webDir.absolutePath)
        }
    }
}
