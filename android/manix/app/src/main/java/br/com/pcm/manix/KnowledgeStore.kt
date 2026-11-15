package br.com.pcm.manix

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.text.Normalizer
import java.util.Locale

class KnowledgeStore(context: Context) : SQLiteOpenHelper(context, "pcm_knowledge.db", null, 1) {

    data class Hit(val title: String, val body: String)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE VIRTUAL TABLE knowledge USING fts4(" +
                "title TEXT, body TEXT, tokenize=unicode61)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS knowledge")
        onCreate(db)
    }

    fun count(): Long = readableDatabase.rawQuery("SELECT COUNT(*) FROM knowledge", null).use { cursor ->
        if (cursor.moveToFirst()) cursor.getLong(0) else 0L
    }

    fun clear() {
        writableDatabase.delete("knowledge", null, null)
    }

    fun importText(sourceName: String, input: InputStream): Int {
        val db = writableDatabase
        var inserted = 0
        db.beginTransaction()
        try {
            BufferedReader(InputStreamReader(input, Charsets.UTF_8), 64 * 1024).use { reader ->
                val buffer = StringBuilder()
                var chunkIndex = 1

                fun flushChunk() {
                    val text = buffer.toString().trim()
                    if (text.length < 30) {
                        buffer.clear()
                        return
                    }
                    val values = android.content.ContentValues().apply {
                        put("title", "$sourceName · bloco $chunkIndex")
                        put("body", text)
                    }
                    db.insertOrThrow("knowledge", null, values)
                    inserted++
                    chunkIndex++
                    buffer.clear()
                }

                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    val clean = line.orEmpty().trim()
                    if (clean.isBlank()) {
                        if (buffer.length >= 500) flushChunk()
                        continue
                    }
                    if (buffer.length + clean.length + 1 > 1400) flushChunk()
                    buffer.append(clean).append('\n')
                }
                flushChunk()
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return inserted
    }

    fun search(question: String, limit: Int = 6): List<Hit> {
        val terms = tokenize(question)
        if (terms.isEmpty()) return emptyList()

        val match = terms.take(10).joinToString(" OR ") { "\"$it\"" }
        val hits = mutableListOf<Hit>()
        try {
            readableDatabase.rawQuery(
                "SELECT title, body FROM knowledge WHERE knowledge MATCH ? LIMIT ?",
                arrayOf(match, limit.toString())
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    hits += Hit(cursor.getString(0), cursor.getString(1))
                }
            }
        } catch (_: Exception) {
            val term = terms.first()
            readableDatabase.rawQuery(
                "SELECT title, body FROM knowledge WHERE body LIKE ? LIMIT ?",
                arrayOf("%$term%", limit.toString())
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    hits += Hit(cursor.getString(0), cursor.getString(1))
                }
            }
        }
        return hits
    }

    fun buildContext(question: String, limit: Int = 6): String {
        val hits = search(question, limit)
        if (hits.isEmpty()) return ""
        return hits.mapIndexed { index, hit ->
            "[Trecho ${index + 1}] ${hit.body.trim()}"
        }.joinToString("\n\n")
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
