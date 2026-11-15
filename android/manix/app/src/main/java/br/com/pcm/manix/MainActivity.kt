package br.com.pcm.manix

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val engine by lazy { AiChat.getInferenceEngine(applicationContext) }
    private val knowledge by lazy { KnowledgeStore(applicationContext) }

    private lateinit var status: TextView
    private lateinit var chat: TextView
    private lateinit var prompt: EditText
    private lateinit var progress: ProgressBar
    private lateinit var sendButton: Button
    private lateinit var baseCount: TextView
    private lateinit var chatScroll: ScrollView

    private var generationJob: Job? = null
    private var modelReady = false
    private val modelFile by lazy { File(filesDir, "models/manix-1.5b-q4_k_m.gguf") }

    private val pickModel = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) importModel(uri)
    }

    private val pickKnowledge = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) importKnowledge(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        refreshBaseCount()
        scope.launch {
            try {
                awaitEngineInitialized()
                if (modelFile.exists()) loadModel(modelFile)
                else setStatus("Selecione o arquivo MANIX .gguf para ativar a IA local.")
            } catch (e: Exception) {
                showError("Falha ao inicializar o motor local", e)
            }
        }
    }

    override fun onDestroy() {
        generationJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    private fun buildUi() {
        window.statusBarColor = bg
        window.navigationBarColor = bg

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(14))
            setBackgroundColor(bg)
        }

        val brand = TextView(this).apply {
            text = "MANIX"
            setTextColor(emerald)
            textSize = 26f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.12f
        }
        root.addView(brand)

        val subtitle = TextView(this).apply {
            text = "Inteligência local para manutenção"
            setTextColor(textMuted)
            textSize = 13f
            setPadding(0, 0, 0, dp(14))
        }
        root.addView(subtitle)

        val statusCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = rounded(card, 16f)
        }
        status = TextView(this).apply {
            text = "Inicializando motor local…"
            setTextColor(textMain)
            textSize = 14f
        }
        baseCount = TextView(this).apply {
            setTextColor(textMuted)
            textSize = 12f
            setPadding(0, dp(4), 0, 0)
        }
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            max = 100
            setPadding(0, dp(8), 0, 0)
        }
        statusCard.addView(status)
        statusCard.addView(baseCount)
        statusCard.addView(progress, LinearLayout.LayoutParams(-1, dp(14)))
        root.addView(statusCard, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })

        val actionsScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

        val modelButton = actionButton("Carregar MANIX") {
            pickModel.launch(arrayOf("application/octet-stream", "*/*"))
        }
        val baseButton = actionButton("Importar base PCM") {
            pickKnowledge.launch(arrayOf("text/plain", "text/csv", "application/csv", "*/*"))
        }
        val clearButton = actionButton("Limpar base") { confirmClearBase() }
        actions.addView(modelButton)
        actions.addView(baseButton)
        actions.addView(clearButton)
        actionsScroll.addView(actions)
        root.addView(actionsScroll, LinearLayout.LayoutParams(-1, dp(48)).apply { bottomMargin = dp(8) })

        chatScroll = ScrollView(this).apply {
            isFillViewport = true
            background = rounded(card, 18f)
        }
        chat = TextView(this).apply {
            text = "A MANIX roda no aparelho. Carregue o modelo uma vez e, depois, a conversa funciona offline.\n"
            setTextColor(textMain)
            textSize = 15f
            setLineSpacing(0f, 1.12f)
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        chatScroll.addView(chat)
        root.addView(chatScroll, LinearLayout.LayoutParams(-1, 0, 1f).apply { bottomMargin = dp(10) })

        val composer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
        }
        prompt = EditText(this).apply {
            hint = "Descreva a falha, sintoma ou dúvida…"
            setHintTextColor(Color.rgb(113, 130, 124))
            setTextColor(textMain)
            textSize = 15f
            minLines = 2
            maxLines = 5
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            setPadding(dp(14), dp(10), dp(14), dp(10))
            background = rounded(card2, 16f, strokeColor = Color.rgb(42, 75, 64))
        }
        composer.addView(prompt, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = dp(8) })

        sendButton = Button(this).apply {
            text = "Enviar"
            isAllCaps = false
            textSize = 14f
            setTextColor(Color.rgb(5, 30, 23))
            background = rounded(emerald, 16f)
            setOnClickListener { sendPrompt() }
        }
        composer.addView(sendButton, LinearLayout.LayoutParams(dp(86), dp(54)))
        root.addView(composer)

        setContentView(root)
    }

    private fun actionButton(label: String, onClick: () -> Unit): Button = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 13f
        setTextColor(textMain)
        background = rounded(card2, 14f, strokeColor = Color.rgb(43, 68, 60))
        setPadding(dp(14), 0, dp(14), 0)
        setOnClickListener { onClick() }
    }.also { button ->
        button.layoutParams = LinearLayout.LayoutParams(-2, dp(42)).apply { marginEnd = dp(8) }
    }

    private suspend fun awaitEngineInitialized() {
        val state = engine.state.first {
            it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error
        }
        if (state is InferenceEngine.State.Error) throw state.exception
    }

    private suspend fun awaitEngineInitializedIfNeeded() {
        when (engine.state.value) {
            is InferenceEngine.State.Uninitialized,
            is InferenceEngine.State.Initializing -> awaitEngineInitialized()
            else -> Unit
        }
    }

    private fun importModel(uri: Uri) {
        generationJob?.cancel()
        scope.launch {
            modelReady = false
            sendButton.isEnabled = false
            progress.isIndeterminate = false
            progress.progress = 0
            setStatus("Copiando o modelo para o armazenamento privado…")
            try {
                awaitEngineInitializedIfNeeded()
                if (engine.state.value !is InferenceEngine.State.Initialized) {
                    engine.cleanUp()
                    engine.state.first { it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error }
                }

                val total = querySize(uri)
                modelFile.parentFile?.mkdirs()
                withContext(Dispatchers.IO) {
                    contentResolver.openInputStream(uri).use { input ->
                        requireNotNull(input) { "Não foi possível abrir o arquivo." }
                        FileOutputStream(modelFile).use { output ->
                            val buffer = ByteArray(1024 * 1024)
                            var copied = 0L
                            var read: Int
                            var lastPct = -1
                            while (input.read(buffer).also { read = it } >= 0) {
                                if (read == 0) continue
                                output.write(buffer, 0, read)
                                copied += read
                                if (total > 0L) {
                                    val pct = ((copied * 100.0) / total).roundToInt().coerceIn(0, 100)
                                    if (pct >= lastPct + 2) {
                                        lastPct = pct
                                        withContext(Dispatchers.Main) {
                                            progress.progress = pct
                                            status.text = "Copiando MANIX… $pct%"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                loadModel(modelFile)
            } catch (e: Exception) {
                modelFile.delete()
                showError("Falha ao importar o modelo", e)
            } finally {
                progress.isIndeterminate = false
                sendButton.isEnabled = true
            }
        }
    }

    private suspend fun loadModel(file: File) {
        setStatus("Carregando MANIX na memória…")
        progress.isIndeterminate = true
        sendButton.isEnabled = false
        try {
            awaitEngineInitializedIfNeeded()
            if (engine.state.value !is InferenceEngine.State.Initialized) {
                try { engine.cleanUp() } catch (_: Exception) {}
                engine.state.first { it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error }
            }
            engine.loadModel(file.absolutePath)
            engine.setSystemPrompt(SYSTEM_PROMPT)
            modelReady = true
            setStatus("MANIX pronta · inferência local")
        } catch (e: Exception) {
            modelReady = false
            showError("Não foi possível carregar a MANIX", e)
        } finally {
            progress.isIndeterminate = false
            progress.progress = if (modelReady) 100 else 0
            sendButton.isEnabled = true
        }
    }

    private fun importKnowledge(uri: Uri) {
        scope.launch {
            progress.isIndeterminate = true
            setStatus("Indexando a base PCM no aparelho…")
            try {
                val name = queryName(uri) ?: "base_pcm"
                val inserted = withContext(Dispatchers.IO) {
                    contentResolver.openInputStream(uri).use { input ->
                        requireNotNull(input) { "Não foi possível abrir a base." }
                        knowledge.importText(name, input)
                    }
                }
                refreshBaseCount()
                setStatus("Base PCM atualizada · $inserted novos blocos")
            } catch (e: Exception) {
                showError("Falha ao importar a base PCM", e)
            } finally {
                progress.isIndeterminate = false
            }
        }
    }

    private fun sendPrompt() {
        val question = prompt.text.toString().trim()
        if (question.isBlank()) return
        if (!modelReady) {
            setStatus("Carregue a MANIX antes de enviar a pergunta.")
            return
        }
        if (generationJob?.isActive == true) return

        prompt.setText("")
        appendChat("\nVOCÊ\n$question\n\nMANIX\n")
        generationJob = scope.launch {
            sendButton.isEnabled = false
            progress.isIndeterminate = true
            setStatus("Analisando…")
            try {
                val localContext = withContext(Dispatchers.IO) { knowledge.buildContext(question) }
                val message = if (localContext.isBlank()) {
                    question
                } else {
                    """
                    Use os trechos técnicos locais abaixo apenas quando forem pertinentes. Não invente correlação e não mencione nomes de sistemas, tabelas ou campos de origem.

                    CONTEXTO LOCAL:
                    $localContext

                    PERGUNTA DO USUÁRIO:
                    $question
                    """.trimIndent()
                }

                engine.sendUserPrompt(message, 640).collect { token ->
                    appendChat(token)
                }
                appendChat("\n")
                setStatus("MANIX pronta · inferência local")
            } catch (e: Exception) {
                appendChat("\n[Erro de geração]\n")
                showError("Falha durante a resposta", e)
            } finally {
                progress.isIndeterminate = false
                sendButton.isEnabled = true
            }
        }
    }

    private fun confirmClearBase() {
        AlertDialog.Builder(this)
            .setTitle("Limpar base PCM?")
            .setMessage("Os trechos importados serão apagados do aparelho. O modelo MANIX não será removido.")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Limpar") { _, _ ->
                scope.launch {
                    withContext(Dispatchers.IO) { knowledge.clear() }
                    refreshBaseCount()
                    setStatus("Base PCM local limpa.")
                }
            }
            .show()
    }

    private fun refreshBaseCount() {
        scope.launch {
            val count = withContext(Dispatchers.IO) { knowledge.count() }
            baseCount.text = "Base PCM local: $count blocos indexados"
        }
    }

    private fun appendChat(value: String) {
        chat.append(value)
        chatScroll.post { chatScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun setStatus(value: String) {
        status.text = value
    }

    private fun showError(title: String, e: Throwable) {
        val message = e.message?.takeIf { it.isNotBlank() } ?: e.javaClass.simpleName
        setStatus("$title: $message")
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun querySize(uri: Uri): Long {
        return contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst() && index >= 0 && !cursor.isNull(index)) cursor.getLong(index) else -1L
        } ?: -1L
    }

    private fun queryName(uri: Uri): String? {
        return contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && index >= 0) cursor.getString(index) else null
        }
    }

    private fun rounded(fill: Int, radiusDp: Float, strokeColor: Int? = null): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(fill)
        cornerRadius = dp(radiusDp.toInt()).toFloat()
        strokeColor?.let { setStroke(dp(1), it) }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

    companion object {
        private val bg = Color.rgb(8, 20, 17)
        private val card = Color.rgb(14, 32, 27)
        private val card2 = Color.rgb(19, 41, 35)
        private val emerald = Color.rgb(65, 211, 157)
        private val textMain = Color.rgb(236, 242, 239)
        private val textMuted = Color.rgb(150, 169, 162)

        private const val SYSTEM_PROMPT = """
Você é MANIX, uma assistente especializada em manutenção industrial e gestão de manutenção.
Responda em português do Brasil, com linguagem técnica clara e objetiva.
Analise sintomas, falhas, histórico de ocorrências, causas prováveis, medidas, inspeções e coerência técnica.
Diferencie fatos observados de hipóteses. Não invente medições, eventos, causas ou resultados.
Quando faltarem dados relevantes, diga exatamente quais dados ajudariam a discriminar as hipóteses.
Priorize segurança, diagnóstico e verificações de menor risco antes de sugerir intervenções invasivas.
Não exponha nomes de sistemas corporativos, tabelas, campos de banco, JSON, SAP, ICM ou detalhes de integração, salvo se o usuário pedir explicitamente.
Quando receber contexto técnico local, trate-o como evidência histórica potencial e use apenas os trechos pertinentes à pergunta.
"""
    }
}
