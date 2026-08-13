package kw.backend

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * core は engine の RunEvent を「type と必要な数個のフィールドを除いて不透明な JSON」として扱う。
 * こうしておくと engine 側のイベント語彙が増えても core を触らずに UI まで届く（D16）。
 */
object JsonCodec {
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    fun parse(text: String): JsonObject = json.parseToJsonElement(text).let { it as JsonObject }

    fun encode(obj: JsonObject): String = json.encodeToString(JsonObject.serializer(), obj)

    fun encodeStringList(items: List<String>): String =
        json.encodeToString(JsonArray.serializer(), buildJsonArray { items.forEach { add(JsonPrimitive(it)) } })

    fun decodeStringList(text: String): List<String> = runCatching {
        (json.parseToJsonElement(text) as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull() } ?: emptyList()
    }.getOrDefault(emptyList())

    fun str(obj: JsonObject, key: String): String? = obj[key]?.jsonPrimitive?.contentOrNull()

    fun num(obj: JsonObject, key: String): Double? = obj[key]?.jsonPrimitive?.doubleOrNull
}

private fun JsonPrimitive.contentOrNull(): String? = if (this is JsonNull) null else content

fun nowIso(): String = java.time.Instant.now().toString()
