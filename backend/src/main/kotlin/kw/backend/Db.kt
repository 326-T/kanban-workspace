package kw.backend

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jooq.DSLContext
import org.jooq.JSONB
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import org.jooq.impl.SQLDataType
import java.math.BigDecimal
import java.time.OffsetDateTime

// jOOQ のテーブル定義。codegen は使わず型付きフィールド定数を手で置く
// （schema.sql が単一の真実。将来 jooq-codegen を足す場合もこの DDL から生成できる）。

object Users {
    val TABLE = DSL.table(DSL.name("kw_users"))
    val NAME = DSL.field(DSL.name("name"), SQLDataType.VARCHAR)
    val ROLE = DSL.field(DSL.name("role"), SQLDataType.VARCHAR)
    val CREATED_AT = DSL.field(DSL.name("created_at"), SQLDataType.OFFSETDATETIME)
}

object Resources {
    val TABLE = DSL.table(DSL.name("kw_resources"))
    val NAME = DSL.field(DSL.name("name"), SQLDataType.VARCHAR)
    val KIND = DSL.field(DSL.name("kind"), SQLDataType.VARCHAR)
    val PATH = DSL.field(DSL.name("path"), SQLDataType.VARCHAR)
    val TAGS = DSL.field(DSL.name("tags"), SQLDataType.JSONB)
    val CREATED_AT = DSL.field(DSL.name("created_at"), SQLDataType.OFFSETDATETIME)
}

object Runs {
    val TABLE = DSL.table(DSL.name("kw_runs"))
    val ID = DSL.field(DSL.name("id"), SQLDataType.VARCHAR)
    val PROMPT = DSL.field(DSL.name("prompt"), SQLDataType.CLOB)
    val CWD = DSL.field(DSL.name("cwd"), SQLDataType.VARCHAR)
    val ENGINE = DSL.field(DSL.name("engine"), SQLDataType.VARCHAR)
    val MODEL = DSL.field(DSL.name("model"), SQLDataType.VARCHAR)
    val STATE = DSL.field(DSL.name("state"), SQLDataType.VARCHAR)
    val COST_USD = DSL.field(DSL.name("cost_usd"), SQLDataType.NUMERIC)
    val AUTO_APPROVE = DSL.field(DSL.name("auto_approve"), SQLDataType.BOOLEAN)
    val REPO = DSL.field(DSL.name("repo"), SQLDataType.VARCHAR)
    val BRANCH = DSL.field(DSL.name("branch"), SQLDataType.VARCHAR)
    val LAUNCHED_BY = DSL.field(DSL.name("launched_by"), SQLDataType.VARCHAR)
    val CREATED_AT = DSL.field(DSL.name("created_at"), SQLDataType.OFFSETDATETIME)
}

object RunEvents {
    val TABLE = DSL.table(DSL.name("kw_run_events"))
    val RUN_ID = DSL.field(DSL.name("run_id"), SQLDataType.VARCHAR)
    val SEQ = DSL.field(DSL.name("seq"), SQLDataType.INTEGER)
    val TYPE = DSL.field(DSL.name("type"), SQLDataType.VARCHAR)
    val PAYLOAD = DSL.field(DSL.name("payload"), SQLDataType.JSONB)
    val ENGINE_SEQ = DSL.field(DSL.name("engine_seq"), SQLDataType.INTEGER)
    val CREATED_AT = DSL.field(DSL.name("created_at"), SQLDataType.OFFSETDATETIME)
}

object Db {
    fun connect(cfg: Config): DSLContext {
        val hikari = HikariConfig().apply {
            jdbcUrl = cfg.jdbcUrl
            username = cfg.dbUser
            password = cfg.dbPassword
            maximumPoolSize = 10
            poolName = "kw-backend"
        }
        val dsl = DSL.using(HikariDataSource(hikari), SQLDialect.POSTGRES)
        val ddl = Db::class.java.getResource("/schema.sql")!!.readText()
        dsl.connection { conn -> conn.createStatement().use { it.execute(ddl) } }
        return dsl
    }
}

// jOOQ ↔ アプリ型の小さな変換ヘルパ
fun JSONB?.orEmptyJson(): String = this?.data() ?: "{}"

fun BigDecimal?.toDoubleOrNull(): Double? = this?.toDouble()

fun OffsetDateTime?.iso(): String = (this ?: OffsetDateTime.now()).toInstant().toString()
