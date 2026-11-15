package br.com.pcm.manix

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class ManixCloud(private val context: Context) {
    data class Session(val accessToken: String, val refreshToken: String, val expiresAt: Long)
    data class ModelInfo(val version: String, val sha256: String, val url: String?)

    private val prefs = context.getSharedPreferences("manix_cloud", Context.MODE_PRIVATE)

    suspend fun signIn(email: String, password: String): Session = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email).put("password", password)
        val json = requestJson(
            "$BASE_URL/auth/v1/token?grant_type=password",
            "POST",
            body.toString(),
            mapOf("apikey" to PUBLISHABLE_KEY, "Content-Type" to "application/json")
        )
        saveSession(json)
    }

    fun hasSession(): Boolean = prefs.getString("refresh_token", null) != null

    suspend fun accessToken(): String = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis() / 1000L
        val access = prefs.getString("access_token", null)
        val expiresAt = prefs.getLong("expires_at", 0L)
        if (!access.isNullOrBlank() && expiresAt > now + 60L) return@withContext access

        val refresh = prefs.getString("refresh_token", null)
            ?: throw IllegalStateException("Sessão não encontrada.")
        val body = JSONObject().put("refresh_token", refresh)
        val json = requestJson(
            "$BASE_URL/auth/v1/token?grant_type=refresh_token",
            "POST",
            body.toString(),
            mapOf("apikey" to PUBLISHABLE_KEY, "Content-Type" to "application/json")
        )
        saveSession(json).accessToken
    }

    fun signOut() {
        prefs.edit().clear().apply()
    }

    suspend fun fetchModelInfo(): ModelInfo = withContext(Dispatchers.IO) {
        val token = accessToken()
        val json = requestJson(
            "$BASE_URL/functions/v1/manix-mobile-bootstrap",
            "POST",
            "{}",
            authHeaders(token)
        )
        val model = json.getJSONObject("model")
        ModelInfo(
            version = model.optString("version", "pending"),
            sha256 = model.optString("sha256", ""),
            url = model.optString("url").takeIf { it.isNotBlank() && it != "null" }
        )
    }

    suspend fun syncKnowledge(store: KnowledgeStore): Pair<Int, Int> = withContext(Dispatchers.IO) {
        val token = accessToken()
        val chunks = requestArray(
            "$BASE_URL/rest/v1/manix_chunks?select=id,document_id,heading,content,created_at&order=id.asc&limit=5000",
            authHeaders(token)
        )
        val dataset = requestArray(
            "$BASE_URL/rest/v1/pcm_teresina_dataset?id=eq.principal&select=revision,payload,updated_at",
            authHeaders(token)
        )
        val chunkCount = store.replaceCloudChunks(chunks)
        val datasetCount = if (dataset.length() > 0) store.replaceDataset(dataset.getJSONObject(0)) else 0
        chunkCount to datasetCount
    }

    suspend fun downloadModel(info: ModelInfo, destination: File, onProgress: (Int) -> Unit) =
        withContext(Dispatchers.IO) {
            val modelUrl = info.url ?: throw IllegalStateException("Modelo MANIX ainda não foi publicado.")
            destination.parentFile?.mkdirs()
            val temp = File(destination.parentFile, destination.name + ".part")
            val conn = (URL(modelUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 20_000
                readTimeout = 120_000
                instanceFollowRedirects = true
            }
            conn.connect()
            if (conn.responseCode !in 200..299) {
                throw IllegalStateException("Falha ao obter modelo (" + conn.responseCode + ").")
            }
            val total = conn.contentLengthLong
            var copied = 0L
            var last = -1
            conn.inputStream.use { input ->
                FileOutputStream(temp).use { output ->
                    val buffer = ByteArray(1024 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        copied += n
                        if (total > 0L) {
                            val pct = ((copied * 100L) / total).toInt().coerceIn(0, 100)
                            if (pct != last) {
                                last = pct
                                onProgress(pct)
                            }
                        }
                    }
                }
            }
            conn.disconnect()

            if (info.sha256.isNotBlank()) {
                val actual = sha256(temp)
                if (!actual.equals(info.sha256, ignoreCase = true)) {
                    temp.delete()
                    throw IllegalStateException("Falha de integridade do modelo.")
                }
            }
            if (destination.exists()) destination.delete()
            if (!temp.renameTo(destination)) {
                temp.copyTo(destination, overwrite = true)
                temp.delete()
            }
            prefs.edit().putString("model_version", info.version).apply()
        }

    fun cachedModelVersion(): String? = prefs.getString("model_version", null)

    private fun saveSession(json: JSONObject): Session {
        val access = json.getString("access_token")
        val refresh = json.getString("refresh_token")
        val expiresIn = json.optLong("expires_in", 3600L)
        val expiresAt = System.currentTimeMillis() / 1000L + expiresIn
        prefs.edit()
            .putString("access_token", access)
            .putString("refresh_token", refresh)
            .putLong("expires_at", expiresAt)
            .apply()
        return Session(access, refresh, expiresAt)
    }

    private fun authHeaders(token: String) = mapOf(
        "apikey" to PUBLISHABLE_KEY,
        "Authorization" to "Bearer $token",
        "Content-Type" to "application/json"
    )

    private fun requestJson(url: String, method: String, body: String?, headers: Map<String, String>): JSONObject =
        JSONObject(requestText(url, method, body, headers))

    private fun requestArray(url: String, headers: Map<String, String>): JSONArray =
        JSONArray(requestText(url, "GET", null, headers))

    private fun requestText(url: String, method: String, body: String?, headers: Map<String, String>): String {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 20_000
            readTimeout = 120_000
            instanceFollowRedirects = true
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
            if (body != null) {
                doOutput = true
                outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        conn.disconnect()
        if (code !in 200..299) {
            val message = runCatching {
                val obj = JSONObject(text)
                obj.optString("msg").ifBlank {
                    obj.optString("error_description").ifBlank { obj.optString("error") }
                }
            }.getOrNull().orEmpty()
            throw IllegalStateException(message.ifBlank { "Erro de comunicação ($code)." })
        }
        return text
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val BASE_URL = "https://zvbkbjtajmdfrxonrhen.supabase.co"
        const val PUBLISHABLE_KEY = "sb_publishable_XMyJui36fm00__Mvs1LY5A_p1GVD-S_"
    }
}
