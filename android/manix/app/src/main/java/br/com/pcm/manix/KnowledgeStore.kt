package br.com.pcm.manix

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

class KnowledgeStore(context: Context) : SQLiteOpenHelper(context, "pcm_knowledge.db", null, 2) {

    data class Hit(val title: String, val body: String)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE VIRTUAL TABLE knowledge USING fts4(" +
                "source TEXT, title TEXT, body TEXT, tokenize=unicode61)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS knowledge")
        onCreate(db)
    }

    fun count(): Long = readableDatabase.rawQuery("SELECT COUNT(*) FROM knowledge", null).use { cursor ->
        if (cursor.moveToFirst()) cursor.getLong(0) else 0L
    }

    fun replaceCloudChunks(chunks: JSONArray): Int {
        val db = writableDatabase
        db.beginTransaction()
        return try {
            db.delete("knowledge", "source=?", arrayOf("cloud"))
            var inserted = 0
            for (i in 0 until chunks.length()) {
                val obj = chunks.getJSONObject(i)
                val body = obj.optString("content").trim()
                if (body.length < 20) continue
                insert(db, "cloud", obj.optString("heading").ifBlank { "Base técnica MANIX" }, body)
                inserted++
            }
            db.setTransactionSuccessful()
            inserted
        } finally {
            db.endTransaction()
        }
    }

    fun replaceDataset(row: JSONObject): Int {
        val db = writableDatabase
        db.beginTransaction()
        return try {
            db.delete("knowledge", "source=?", arrayOf("dataset"))
            val records = mutableListOf<Pair<String, String>>()
            flattenPayload(row.opt("payload"), "Histórico PCM", records)

            var inserted = 0
            for ((title, body) in records) {
                if (body.length < 20) continue
                chunk(body, 1800).forEachIndexed { index, part ->
                    insert(db, "dataset", if (index == 0) title else title + " · " + (index + 1), part)
                    inserted++
                }
            }
            db.setTransactionSuccessful()
            inserted
        } finally {
            db.endTransaction()
        }
    }

    fun search(question: String, limit: Int = 7): List<Hit> {
        val terms = tokenize(question)
        if (terms.isEmpty()) return emptyList()
        val match = terms.take(10).joinToString(" OR ") { "\"" + it + "\"" }
        val hits = mutableListOf<Hit>()
        try {
            readableDatabase.rawQuery(
                "SELECT title, body FROM knowledge WHERE knowledge MATCH ? LIMIT ?",
                arrayOf(match, limit.toString())
            ).use { cursor ->
                while (cursor.moveToNext()) hits += Hit(cursor.getString(0), cursor.getString(1))
            }
        } catch (_: Exception) {
            val term = terms.first()
            readableDatabase.rawQuery(
                "SELECT title, body FROM knowledge WHERE body LIKE ? LIMIT ?",
                arrayOf("%" + term + "%", limit.toString())
            ).use { cursor ->
                while (cursor.moveToNext()) hits += Hit(cursor.getString(0), cursor.getString(1))
            }
        }
        return hits
    }

    fun buildContext(question: String, limit: Int = 7): String {
        val hits = search(question, limit)
        return hits.mapIndexed { index, hit ->
            "[Evidência " + (index + 1) + "] " + hit.body.trim()
        }.joinToString("\n\n")
    }

    private fun insert(db: SQLiteDatabase, source: String, title: String, body: String) {
        db.insertOrThrow("knowledge", null, ContentValues().apply {
            put("source", source)
            put("title", title)
            put("body", body)
        })
    }

    private fun flattenPayload(value: Any?, label: String, output: MutableList<Pair<String, String>>) {
        when (value) {
            is JSONObject -> {
                val scalar = StringBuilder()
                val nested = mutableListOf<Pair<String, Any?>>()
                val keys = value.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val child = value.opt(key)
                    when (child) {
                        is JSONObject, is JSONArray -> nested += key to child
                        null, JSONObject.NULL -> Unit
                        else -> scalar.append(key).append(": ").append(child.toString()).append('\n')
                    }
                }
                if (scalar.isNotBlank()) output += label to scalar.toString().trim()
                nested.forEach { (key, child) -> flattenPayload(child, humanize(key), output) }
            }
            is JSONArray -> {
                for (i in 0 until value.length()) {
                    val child = value.opt(i)
                    val childLabel = if (value.length() > 1) label + " " + (i + 1) else label
                    flattenPayload(child, childLabel, output)
                }
            }
            null, JSONObject.NULL -> Unit
            else -> output += label to value.toString()
        }
    }

    private fun chunk(text: String, max: Int): List<String> {
        if (text.length <= max) return listOf(text)
        val out = mutableListOf<String>()
        var start = 0
        while (start < text.length) {
            var end = (start + max).coerceAtMost(text.length)
            if (end < text.length) {
                val breakAt = text.lastIndexOf('\n', end).takeIf { it > start + max / 2 } ?: end
                end = breakAt
            }
            out += text.substring(start, end).trim()
            start = end
            while (start < text.length && text[start].isWhitespace()) start++
        }
        return out
    }

    private fun humanize(value: String): String =
        value.replace('_', ' ').replaceFirstChar {
            if (it.isLowerCase()) it.titlecase(Locale("pt", "BR")) else it.toString()
        }

    private fun tokenize(text: String): List<String> {
        val normalized = Normalizer.normalize(text.lowercase(Locale("pt", "BR")), Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
        val stop = setOf(
            "para", "com", "sem", "que", "uma", "uns", "das", "dos", "por", "como", "mais",
            "esta", "esse", "essa", "isso", "ele", "ela", "tem", "foi", "ser", "sobre", "qual",
            "quando", "onde", "porque", "meu", "minha", "nos", "nas", "de", "do", "da", "e", "o", "a"
        )
        return normalized.split(Regex("[^a-z0-9]+"))
            .asSequence()
            .filter { it.length >= 3 && it !in stop }
            .distinct()
            .toList()
    }
}
