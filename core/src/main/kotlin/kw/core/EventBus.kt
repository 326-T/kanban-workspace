package kw.core

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import java.util.concurrent.ConcurrentHashMap

/**
 * UI への SSE 再投影用の in-process fan-out。
 * 真実は Postgres のイベントログなので、ここはあくまで「投影の配線」。
 * replay を持たせておき、購読側は seq で重複を落とす（DB 再生との境目の取りこぼし防止）。
 */
class EventBus {
    private val flows = ConcurrentHashMap<String, MutableSharedFlow<StoredEvent>>()

    private fun mutable(runId: String): MutableSharedFlow<StoredEvent> =
        flows.computeIfAbsent(runId) { MutableSharedFlow(replay = 128, extraBufferCapacity = 512) }

    fun flow(runId: String): SharedFlow<StoredEvent> = mutable(runId)

    suspend fun publish(runId: String, event: StoredEvent) = mutable(runId).emit(event)
}
