package br.com.pcm.manix

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
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
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val engine by lazy { AiChat.getInferenceEngine(applicationContext) }
    private val knowledge by lazy { KnowledgeStore(applicationContext) }
    private val cloud by lazy { ManixCloud(applicationContext) }

    private var generationJob: Job? = null
    private var modelReady = false

    private lateinit var status: TextView
    private lateinit var syncLabel: TextView
    private lateinit var chat: TextView
    private lateinit var chatScroll: ScrollView
    private lateinit var prompt: EditText
    private lateinit var sendButton: Button
    private lateinit var progress: ProgressBar

    private val modelFile by lazy { File(filesDir, "models/manix-1.5b-q4_k_m.gguf") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        if (cloud.hasSession()) {
            showChatUi()
            prepareManix()
        } else {
            showLoginUi()
        }
    }

    override fun onDestroy() {
        generationJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    private fun showLoginUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            setBackgroundColor(bg)
        }

        val mark = TextView(this).apply {
            text = "M"
            gravity = Gravity.CENTER
            textSize = 34f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(bg)
            background = rounded(emerald, 28f)
        }
        root.addView(mark, LinearLayout.LayoutParams(dp(74), dp(74)).apply { bottomMargin = dp(24) })

        root.addView(TextView(this).apply {
            text = "MANIX"
            textSize = 30f
            letterSpacing = 0.12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(textMain)
            gravity = Gravity.CENTER
        })

        root.addView(TextView(this).apply {
            text = "Inteligência de manutenção"
            textSize = 14f
            setTextColor(textMuted)
            gravity = Gravity.CENTER
            setPadding(0, dp(6), 0, dp(28))
        })

        val email = field("E-mail", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val password = field("Senha", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        root.addView(email, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(10) })
        root.addView(password, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(16) })

        val feedback = TextView(this).apply {
            setTextColor(textMuted)
            textSize = 12f
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        val enter = Button(this).apply {
            text = "Entrar"
            isAllCaps = false
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(bg)
            background = rounded(emerald, 18f)
            setOnClickListener {
                val e = email.text.toString().trim()
                val p = password.text.toString()
                if (e.isBlank() || p.isBlank()) return@setOnClickListener
                isEnabled = false
                feedback.visibility = View.VISIBLE
                feedback.text = "Validando acesso…"
                scope.launch {
                    try {
                        cloud.signIn(e, p)
                        showChatUi()
                        prepareManix()
                    } catch (ex: Exception) {
                        feedback.text = ex.message ?: "Não foi possível entrar."
                        isEnabled = true
                    }
                }
            }
        }
        root.addView(enter, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(12) })
        root.addView(feedback)

        setContentView(root)
    }

    private fun showChatUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(14), dp(18), dp(14))
            setBackgroundColor(bg)
        }

        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val titleBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        titleBox.addView(TextView(this).apply {
            text = "MANIX"
            setTextColor(textMain)
            textSize = 24f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.10f
        })
        titleBox.addView(TextView(this).apply {
            text = "Diagnóstico • PCM • confiabilidade"
            setTextColor(textMuted)
            textSize = 12f
        })
        top.addView(titleBox, LinearLayout.LayoutParams(0, -2, 1f))

        val logout = TextView(this).apply {
            text = "Sair"
            textSize = 12f
            setTextColor(textMuted)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = rounded(card2, 14f, border)
            setOnClickListener {
                cloud.signOut()
                modelReady = false
                showLoginUi()
            }
        }
        top.addView(logout)
        root.addView(top, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })

        val statusCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(15), dp(13), dp(15), dp(13))
            background = rounded(card, 18f, border)
        }
        val statusRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        status = TextView(this).apply {
            text = "Preparando MANIX…"
            setTextColor(textMain)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
        }
        syncLabel = TextView(this).apply {
            text = "ONLINE"
            setTextColor(emerald)
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.END
        }
        statusRow.addView(status, LinearLayout.LayoutParams(0, -2, 1f))
        statusRow.addView(syncLabel)
        statusCard.addView(statusRow)

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            max = 100
        }
        statusCard.addView(progress, LinearLayout.LayoutParams(-1, dp(12)).apply { topMargin = dp(10) })
        root.addView(statusCard, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12) })

        chatScroll = ScrollView(this).apply {
            isFillViewport = true
            background = rounded(card, 20f, border)
        }
        chat = TextView(this).apply {
            text = "MANIX\nDescreva o equipamento, o sintoma e o que já foi verificado. Vou cruzar a base disponível e separar evidências de hipóteses.\n"
            setTextColor(textMain)
            textSize = 15f
            setLineSpacing(0f, 1.16f)
            setPadding(dp(18), dp(18), dp(18), dp(18))
        }
        chatScroll.addView(chat)
        root.addView(chatScroll, LinearLayout.LayoutParams(-1, 0, 1f).apply { bottomMargin = dp(10) })

        val composer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
        }
        prompt = EditText(this).apply {
            hint = "Pergunte sobre a ocorrência…"
            setHintTextColor(hintColor)
            setTextColor(textMain)
            textSize = 15f
            minLines = 1
            maxLines = 5
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = rounded(card2, 17f, border)
        }
        composer.addView(prompt, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = dp(8) })

        sendButton = Button(this).apply {
            text = "Enviar"
            isAllCaps = false
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(bg)
            background = rounded(emerald, 17f)
            isEnabled = false
            setOnClickListener { sendPrompt() }
        }
        composer.addView(sendButton, LinearLayout.LayoutParams(dp(88), dp(54)))
        root.addView(composer)

        setContentView(root)
    }

    private fun prepareManix() {
        scope.launch {
            modelReady = false
            sendButton.isEnabled = false
            progress.isIndeterminate = true
            setStatus("Sincronizando conhecimento…")
            try {
                awaitEngineInitialized()

                val syncResult = runCatching { cloud.syncKnowledge(knowledge) }
                val count = withContext(Dispatchers.IO) { knowledge.count() }
                syncLabel.text = if (syncResult.isSuccess) "SINCRONIZADO · " + count else "OFFLINE · " + count

                val info = runCatching { cloud.fetchModelInfo() }.getOrNull()
                if (info == null) {
                    if (modelFile.exists()) {
                        loadModel(modelFile)
                    } else {
                        setUnavailable("Sem conexão para preparar a MANIX.")
                    }
                    return@launch
                }

                val cached = cloud.cachedModelVersion()
                val needsDownload = !modelFile.exists() || (info.version != "pending" && cached != info.version)

                if (needsDownload) {
                    if (info.parts.isEmpty()) {
                        setUnavailable("MANIX aguardando publicação do modelo.")
                        return@launch
                    }
                    progress.isIndeterminate = false
                    setStatus("Preparando MANIX no aparelho…")
                    cloud.downloadModel(info, modelFile) { pct ->
                        runOnUiThread {
                            progress.progress = pct
                            status.text = "Preparando MANIX… " + pct + "%"
                        }
                    }
                }
                loadModel(modelFile)
            } catch (ex: Exception) {
                if (modelFile.exists()) {
                    runCatching { loadModel(modelFile) }
                        .onFailure { setUnavailable(it.message ?: "MANIX indisponível.") }
                } else {
                    setUnavailable(ex.message ?: "MANIX indisponível.")
                }
            }
        }
    }

    private suspend fun awaitEngineInitialized() {
        val state = engine.state.first {
            it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error
        }
        if (state is InferenceEngine.State.Error) throw state.exception
    }

    private suspend fun loadModel(file: File) {
        setStatus("Carregando inteligência local…")
        progress.isIndeterminate = true
        if (engine.state.value !is InferenceEngine.State.Initialized) {
            runCatching { engine.cleanUp() }
            engine.state.first { it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error }
        }
        engine.loadModel(file.absolutePath)
        engine.setSystemPrompt(SYSTEM_PROMPT)
        modelReady = true
        progress.isIndeterminate = false
        progress.progress = 100
        setStatus("MANIX pronta")
        syncLabel.text = "LOCAL + SYNC"
        sendButton.isEnabled = true
    }

    private fun sendPrompt() {
        val question = prompt.text.toString().trim()
        if (question.isBlank() || !modelReady || generationJob?.isActive == true) return
        prompt.setText("")
        appendChat("\n\nVOCÊ\n" + question + "\n\nMANIX\n")
        generationJob = scope.launch {
            sendButton.isEnabled = false
            progress.isIndeterminate = true
            setStatus("Analisando ocorrência…")
            try {
                val localContext = withContext(Dispatchers.IO) { knowledge.buildContext(question) }
                val message = if (localContext.isBlank()) {
                    question
                } else {
                    "Use as evidências locais abaixo somente quando forem pertinentes. " +
                        "Não mencione nomes de sistemas, tabelas ou campos de origem.\n\n" +
                        "EVIDÊNCIAS LOCAIS:\n" + localContext +
                        "\n\nPERGUNTA:\n" + question
                }
                engine.sendUserPrompt(message, 700).collect { token -> appendChat(token) }
                appendChat("\n")
                setStatus("MANIX pronta")
            } catch (ex: Exception) {
                appendChat("\nNão consegui concluir essa análise. Tente novamente.\n")
                setStatus("Falha na análise")
            } finally {
                progress.isIndeterminate = false
                progress.progress = 100
                sendButton.isEnabled = modelReady
            }
        }
    }

    private fun setUnavailable(message: String) {
        modelReady = false
        sendButton.isEnabled = false
        progress.isIndeterminate = false
        progress.progress = 0
        setStatus(message)
        syncLabel.text = "INDISPONÍVEL"
    }

    private fun appendChat(value: String) {
        chat.append(value)
        chatScroll.post { chatScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun setStatus(value: String) {
        status.text = value
    }

    private fun field(hintText: String, type: Int): EditText = EditText(this).apply {
        hint = hintText
        inputType = type
        setHintTextColor(hintColor)
        setTextColor(textMain)
        textSize = 15f
        setPadding(dp(16), 0, dp(16), 0)
        background = rounded(card2, 17f, border)
    }

    private fun rounded(fill: Int, radiusDp: Float, strokeColor: Int? = null): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fill)
            cornerRadius = dp(radiusDp.toInt()).toFloat()
            strokeColor?.let { setStroke(dp(1), it) }
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

    companion object {
        private val bg = Color.rgb(6, 15, 13)
        private val card = Color.rgb(12, 27, 23)
        private val card2 = Color.rgb(17, 35, 30)
        private val border = Color.rgb(35, 66, 56)
        private val emerald = Color.rgb(75, 224, 163)
        private val textMain = Color.rgb(238, 244, 241)
        private val textMuted = Color.rgb(139, 160, 152)
        private val hintColor = Color.rgb(104, 126, 118)

        private const val SYSTEM_PROMPT = """
Você é MANIX, uma assistente especializada em manutenção industrial, PCM e confiabilidade.
Responda em português do Brasil, com linguagem técnica clara, objetiva e natural.
Analise sintomas, falhas, histórico, causas prováveis, medidas, inspeções e coerência técnica.
Diferencie explicitamente fatos observados de hipóteses. Não invente medições, eventos, causas ou resultados.
Quando faltarem dados, informe quais verificações discriminam melhor as hipóteses.
Priorize segurança, diagnóstico e verificações de menor risco antes de sugerir intervenções invasivas.
Não exponha nomes de sistemas corporativos, tabelas, campos, JSON, SAP, ICM ou detalhes de integração, salvo se o usuário pedir explicitamente.
Quando receber contexto técnico local, use apenas evidências pertinentes e não force correlações.
"""
    }
}
