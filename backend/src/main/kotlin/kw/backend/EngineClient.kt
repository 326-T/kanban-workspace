package kw.backend

import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.sse.sse
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.slf4j.LoggerFactory

/**
 * kw-engine（bun）のクライアント。engine は「エンジンを駆動して RunEvent を SSE で流す」だけの
 * サービスであり、ドメイン判断はすべて core 側にある（D16）。
 */
class EngineClient(private val baseUrl: String) {
    private val log = LoggerFactory.getLogger(EngineClient::class.java)

    private val http = HttpClient(CIO) {
        install(SSE)
        install(HttpTimeout) {
            // SSE を張り続けるためリクエスト/ソケットのタイムアウトは無効化する
            requestTimeoutMillis = Long.MAX_VALUE
            socketTimeoutMillis = Long.MAX_VALUE
            connectTimeoutMillis = 10_000
        }
        expectSuccess = false
    }

    suspend fun launch(payload: JsonObject) {
        val res = http.post("$baseUrl/runs") {
            contentType(ContentType.Application.Json)
            setBody(JsonCodec.encode(payload))
        }
        check(res.status.isSuccess()) { "engine launch failed (${res.status}): ${res.bodyAsText()}" }
    }

    /** engine 上に Run が生きているか。core 再起動後の再接続判定に使う */
    suspend fun status(runId: String): JsonObject? {
        val res = runCatching { http.get("$baseUrl/runs/$runId") }.getOrNull() ?: return null
        if (res.status != HttpStatusCode.OK) return null
        return runCatching { JsonCodec.parse(res.bodyAsText()) }.getOrNull()
    }

    suspend fun message(runId: String, text: String) =
        post("$baseUrl/runs/$runId/messages", buildJsonObject { put("text", text) })

    suspend fun decide(runId: String, requestId: String, allow: Boolean, by: String) =
        post("$baseUrl/runs/$runId/permissions/$requestId", buildJsonObject {
            put("allow", allow)
            put("by", by)
        })

    suspend fun end(runId: String) = post("$baseUrl/runs/$runId/end", buildJsonObject { })

    private suspend fun post(url: String, body: JsonObject) {
        val res = http.post(url) {
            contentType(ContentType.Application.Json)
            setBody(JsonCodec.encode(body))
        }
        if (!res.status.isSuccess()) log.warn("engine call failed {} -> {} {}", url, res.status, res.bodyAsText())
    }

    /**
     * RunEvent の SSE を購読する。ストリームの正常終了 = Run 終了。
     * lastEngineSeq >= 0 なら Last-Event-ID で途中再開する。
     */
    suspend fun consume(runId: String, lastEngineSeq: Int, onEvent: suspend (Int, JsonObject) -> Unit) {
        http.sse(
            urlString = "$baseUrl/runs/$runId/events",
            request = { if (lastEngineSeq >= 0) header("Last-Event-ID", lastEngineSeq.toString()) },
        ) {
            incoming.collect { sse ->
                val data = sse.data ?: return@collect
                val seq = sse.id?.toIntOrNull() ?: return@collect
                onEvent(seq, JsonCodec.parse(data))
            }
        }
    }
}
