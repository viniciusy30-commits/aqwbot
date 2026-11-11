package com.aqwbot.app

import android.animation.ObjectAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.webkit.WebChromeClient
import android.view.ViewGroup
import android.content.pm.ActivityInfo
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.net.HttpURLConnection
import java.net.URL
import android.net.Uri
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var urlInput: EditText
    private lateinit var skillsInput: EditText
    private lateinit var intervalInput: EditText
    private lateinit var statusText: TextView
    private lateinit var statusDot: View
    private lateinit var startButton: MaterialButton
    private lateinit var stopButton: MaterialButton
    private var pulse: ObjectAnimator? = null

    private val handler = Handler(Looper.getMainLooper())
    private var running = false
    private var keys: List<String> = emptyList()
    private var index = 0
    private var presses = 0
    private var intervalMs = 1500L
    private var bridge: WsTcpBridge? = null

    // Loop da automacao: a cada intervalo, aperta a proxima tecla da sequencia.
    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            val key = keys[index % keys.size]
            pressKey(key)
            index++
            presses++
            setStatus("Rodando: tecla $key (#$presses)", R.color.ok)
            handler.postDelayed(this, intervalMs)
        }
    }

    // Carrega o Ruffle (emulador de Flash) dentro da pagina.
    private val rufflePayload = """
        (function() {
            if (window.__aqwRuffleInjected) return;
            window.__aqwRuffleInjected = true;
            var s = document.createElement('script');
            s.src = 'https://unpkg.com/@ruffle-rs/ruffle';
            document.head.appendChild(s);
        })();
    """.trimIndent()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        urlInput = findViewById(R.id.urlInput)
        skillsInput = findViewById(R.id.skillsInput)
        intervalInput = findViewById(R.id.intervalInput)
        statusText = findViewById(R.id.statusText)
        statusDot = findViewById(R.id.statusDot)
        startButton = findViewById(R.id.startButton)
        stopButton = findViewById(R.id.stopButton)

        // Restaura os ultimos valores digitados.
        val prefs = getSharedPreferences("bot", Context.MODE_PRIVATE)
        prefs.getString("url", null)?.let { urlInput.setText(it) }
        prefs.getString("keys", null)?.let { skillsInput.setText(it) }
        prefs.getString("interval", null)?.let { intervalInput.setText(it) }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = DESKTOP_UA
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return interceptLocal(request)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(rufflePayload, null)
                // Depois de alguns segundos, confere se o Ruffle assumiu algum player.
                handler.postDelayed({ checkRuffle() }, 4000)
            }
        }
        webView.addJavascriptInterface(Native(), "AqwNative")
        webView.webChromeClient = WebChromeClient()

        findViewById<MaterialButton>(R.id.loadButton).setOnClickListener { loadUrl() }
        startButton.setOnClickListener { startBot() }
        stopButton.setOnClickListener { stopBot() }
        findViewById<MaterialButton>(R.id.testButton).setOnClickListener {
            val k = skillsInput.text.toString().split(",", " ").map { it.trim() }
                .firstOrNull { it.length == 1 }
            if (k == null) toast("Digite pelo menos uma tecla") else {
                pressKey(k)
                setStatus("Teste: tecla $k enviada", R.color.warn)
            }
        }
        findViewById<MaterialButton>(R.id.settingsButton).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (fullscreen) {
                    setFullscreen(false)
                    webView.evaluateJavascript("window.exitFs&&exitFs(true)", null)
                } else if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        updateButtons()
        setStatus("Parado", R.color.muted)
        loadUrl()

        // Novidades da versao (so depois de atualizar) e verificacao automatica de atualizacao.
        Novidades.showIfNew(this)
        handler.postDelayed({
            if (!isFinishing && !isDestroyed) Updater.autoCheck(this)
        }, 1500)
    }

    private fun setStatus(text: String, colorRes: Int) {
        statusText.text = text
        statusDot.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, colorRes))
    }

    // Botoes e indicador pulsante conforme o bot esta rodando ou parado.
    private fun updateButtons() {
        startButton.isEnabled = !running
        stopButton.isEnabled = running
        startButton.animate().alpha(if (running) 0.5f else 1f).setDuration(200).start()
        stopButton.animate().alpha(if (running) 1f else 0.5f).setDuration(200).start()
        pulse?.cancel()
        if (running) {
            pulse = ObjectAnimator.ofFloat(statusDot, "alpha", 1f, 0.25f).apply {
                duration = 700
                repeatCount = ObjectAnimator.INFINITE
                repeatMode = ObjectAnimator.REVERSE
                interpolator = LinearInterpolator()
                start()
            }
        } else {
            statusDot.alpha = 1f
        }
    }

    private fun loadUrl() {
        var url = urlInput.text.toString().trim()
        if (url.isEmpty()) return
        // "local" ou "local:URL_DO_SWF" abre a pagina propria com Ruffle + ponte de socket.
        if (url.startsWith("local", ignoreCase = true) || url.trimEnd('/').equals("https://game.aq.com/game", ignoreCase = true)) {
            loadLocalHost(if (url.startsWith("local", ignoreCase = true)) url.substringAfter(":", "").trim() else "")
            return
        }
        if (!url.startsWith("http")) url = "https://$url"
        localLoaded = false
        if (!running) setStatus("Carregando…", R.color.warn)
        webView.loadUrl(url)
    }

    private fun loadLocalHost(swf: String) {
        try {
            val b = bridge ?: WsTcpBridge { msg ->
                handler.post {
                    val esc = org.json.JSONObject.quote(msg)
                    webView.evaluateJavascript("window.hostLog&&hostLog($esc)", null)
                }
            }.also {
                it.setPacketListener(WsTcpBridge.PacketListener { toServer, data, n ->
                    if (capture) {
                        val txt = String(data, 0, n, Charsets.UTF_8).replace('\u0000', '\n').trim()
                        if (txt.isNotEmpty()) jsLog((if (toServer) ">> " else "<< ") + txt.take(400))
                    }
                })
                it.start(); bridge = it
            }
            val u = Uri.Builder().scheme("https").authority(LOCAL_HOST).path("/host.html")
                .appendQueryParameter("port", b.port.toString())
                .appendQueryParameter("token", b.token)
            if (swf.isNotEmpty()) u.appendQueryParameter("swf", swf)
            localLoaded = true
            setStatus("Página local (Ruffle + ponte)", R.color.warn)
            webView.loadUrl(u.build().toString())
        } catch (e: Exception) {
            setStatus("Ponte falhou: ${e.message}", R.color.bad)
        }
    }

    // Serve host.html dos assets e faz proxy de https://appassets.local/p/HOST/CAMINHO -> https://HOST/CAMINHO (com CORS liberado).
    private fun interceptLocal(request: WebResourceRequest): WebResourceResponse? {
        val uri = request.url
        if (uri.host != LOCAL_HOST) return null
        val path = uri.encodedPath ?: return null
        try {
            if (path == "/host.html") {
                return WebResourceResponse("text/html", "utf-8", assets.open("host.html"))
            }
            if ((path.startsWith("/p/") || path.startsWith("/ph/")) && request.method == "GET") {
                val http = path.startsWith("/ph/")
                val rest = path.removePrefix(if (http) "/ph/" else "/p/")
                var fps = 0
                val q = (uri.encodedQuery ?: "").split("&").filter { it.isNotEmpty() }.filter {
                    if (it.startsWith("aqwfps=")) { fps = it.substringAfter("=").toIntOrNull() ?: 0; false } else true
                }
                val target = (if (http) "http://" else "https://") + rest + (if (q.isNotEmpty()) "?" + q.joinToString("&") else "")
                val c = URL(target).openConnection() as HttpURLConnection
                c.connectTimeout = 15000
                c.readTimeout = 30000
                c.setRequestProperty("User-Agent", DESKTOP_UA)
                android.webkit.CookieManager.getInstance().getCookie(target)?.let { c.setRequestProperty("Cookie", it) }
                val code = c.responseCode
                saveCookies(target, c)
                val stream = if (code >= 400) c.errorStream else c.inputStream
                val mime = (c.contentType ?: "application/octet-stream").substringBefore(";").trim()
                val headers = mapOf("Access-Control-Allow-Origin" to "*")
                val isSwf = path.endsWith(".swf", ignoreCase = true)
                if ((fps > 0 || isSwf) && code < 400 && stream != null) {
                    var b = stream.use { it.readBytes() }
                    if (isSwf) saveSwf(rest, b)
                    if (fps > 0) b = patchSwfFps(b, fps)
                    return WebResourceResponse(mime, "utf-8", code, "OK", headers, java.io.ByteArrayInputStream(b))
                }
                return WebResourceResponse(mime, "utf-8", code, "OK", headers, stream)
            }
        } catch (e: Exception) {
            return WebResourceResponse("text/plain", "utf-8", 502, "Bad Gateway", mapOf("Access-Control-Allow-Origin" to "*"),
                java.io.ByteArrayInputStream((e.message ?: "erro").toByteArray()))
        }
        return null
    }

    // Guarda uma copia dos SWFs principais (direto em .../gamefiles/) para exportar e analisar.
    private fun saveSwf(rest: String, bytes: ByteArray) {
        try {
            val i = rest.indexOf("/gamefiles/")
            if (i < 0) return
            val name = rest.substring(i + "/gamefiles/".length)
            if (name.isEmpty() || name.contains("/")) return
            val dir = java.io.File(filesDir, "swf")
            dir.mkdirs()
            java.io.File(dir, name).writeBytes(bytes)
        } catch (_: Exception) {
        }
    }

    private fun exportSwfs() {
        try {
            val dir = java.io.File(filesDir, "swf")
            val files = dir.listFiles()?.filter { it.isFile } ?: emptyList()
            if (files.isEmpty()) {
                toast("Nenhum arquivo salvo ainda: entre no jogo primeiro")
                return
            }
            val outDir = java.io.File(cacheDir, "updates")
            outDir.mkdirs()
            val zip = java.io.File(outDir, "aqw-arquivos-do-jogo.zip")
            java.util.zip.ZipOutputStream(zip.outputStream()).use { z ->
                files.forEach { f ->
                    z.putNextEntry(java.util.zip.ZipEntry(f.name))
                    f.inputStream().use { it.copyTo(z) }
                    z.closeEntry()
                }
            }
            val uri = androidx.core.content.FileProvider.getUriForFile(this, packageName + ".fileprovider", zip)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "application/zip"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, "Enviar arquivos do jogo"))
            jsLog("exportados " + files.size + " arquivos: " + files.joinToString { it.name + " (" + it.length() / 1024 + " KB)" })
        } catch (e: Exception) {
            toast("Falha ao exportar: " + e.message)
        }
    }

    private fun jsLog(msg: String) {
        handler.post { webView.evaluateJavascript("window.hostLog&&hostLog(" + org.json.JSONObject.quote(msg) + ")", null) }
    }

    // Troca a taxa de quadros do SWF principal (experimental). Aceita FWS e CWS; ZWS (LZMA) fica como esta.
    private fun patchSwfFps(data: ByteArray, fps: Int): ByteArray {
        try {
            if (data.size < 20 || data[1] != 'W'.code.toByte() || data[2] != 'S'.code.toByte()) { jsLog("FPS: arquivo nao e SWF"); return data }
            var b = data
            when (data[0].toInt().toChar()) {
                'F' -> {}
                'C' -> {
                    val inf = java.util.zip.Inflater()
                    inf.setInput(data, 8, data.size - 8)
                    val out = java.io.ByteArrayOutputStream()
                    val buf = ByteArray(65536)
                    while (!inf.finished()) {
                        val n = inf.inflate(buf)
                        if (n == 0 && (inf.needsInput() || inf.needsDictionary())) break
                        out.write(buf, 0, n)
                    }
                    inf.end()
                    b = data.copyOfRange(0, 8) + out.toByteArray()
                    b[0] = 'F'.code.toByte()
                }
                else -> { jsLog("FPS: SWF comprimido em LZMA, nao consegui alterar (continua em 24)"); return data }
            }
            val nbits = (b[8].toInt() shr 3) and 31
            val off = 8 + (5 + 4 * nbits + 7) / 8
            val old = b[off + 1].toInt() and 0xFF
            b[off] = 0
            b[off + 1] = fps.coerceIn(1, 120).toByte()
            jsLog("FPS: taxa do jogo alterada de $old para $fps")
            return b
        } catch (e: Exception) {
            jsLog("FPS: falhou (" + e.message + "), continua em 24")
            return data
        }
    }

    private fun saveCookies(target: String, c: HttpURLConnection) {
        val cm = android.webkit.CookieManager.getInstance()
        c.headerFields?.forEach { (k, v) ->
            if (k != null && k.equals("Set-Cookie", ignoreCase = true)) v.forEach { cm.setCookie(target, it) }
        }
        cm.flush()
    }

    @Volatile private var localLoaded = false
    @Volatile private var capture = false
    private var fullscreen = false
    private var origPad = intArrayOf(0, 0, 0, 0)

    // Tela cheia: esconde o painel do app, gira para paisagem e some com as barras do sistema.
    private fun setFullscreen(on: Boolean) {
        val root = webView.parent as ViewGroup
        if (on && !fullscreen) origPad = intArrayOf(root.paddingLeft, root.paddingTop, root.paddingRight, root.paddingBottom)
        fullscreen = on
        for (i in 0 until root.childCount) {
            val v = root.getChildAt(i)
            if (v !== webView) v.visibility = if (on) View.GONE else View.VISIBLE
        }
        if (on) root.setPadding(0, 0, 0, 0) else root.setPadding(origPad[0], origPad[1], origPad[2], origPad[3])
        (webView.layoutParams as? android.widget.LinearLayout.LayoutParams)?.let {
            it.topMargin = if (on) 0 else (10 * resources.displayMetrics.density).toInt()
            webView.layoutParams = it
        }
        requestedOrientation = if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        WindowCompat.setDecorFitsSystemWindows(window, !on)
        val ctl = WindowInsetsControllerCompat(window, window.decorView)
        if (on) {
            ctl.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            ctl.hide(WindowInsetsCompat.Type.systemBars())
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            ctl.show(WindowInsetsCompat.Type.systemBars())
            if (!running) window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Ponte JS -> app para POST (o Android nao entrega o corpo do POST ao proxy normal).
    inner class Native {
        @android.webkit.JavascriptInterface
        fun exportFiles() {
            if (localLoaded) runOnUiThread { exportSwfs() }
        }

        @android.webkit.JavascriptInterface
        fun capture(on: Boolean) {
            if (localLoaded) capture = on
        }

        @android.webkit.JavascriptInterface
        fun fullscreen(on: Boolean) {
            if (!localLoaded) return
            runOnUiThread { setFullscreen(on) }
        }

        @android.webkit.JavascriptInterface
        fun post(url: String, contentType: String, bodyB64: String): String {
            val out = org.json.JSONObject()
            try {
                if (!localLoaded) throw IllegalStateException("bloqueado")
                val u = Uri.parse(url)
                if (u.host != LOCAL_HOST) throw IllegalArgumentException("host")
                val path = u.encodedPath ?: ""
                val http = path.startsWith("/ph/")
                if (!http && !path.startsWith("/p/")) throw IllegalArgumentException("path")
                val rest = path.removePrefix(if (http) "/ph/" else "/p/")
                val target = (if (http) "http://" else "https://") + rest + (u.encodedQuery?.let { "?$it" } ?: "")
                val c = URL(target).openConnection() as HttpURLConnection
                c.connectTimeout = 15000
                c.readTimeout = 30000
                c.requestMethod = "POST"
                c.doOutput = true
                c.setRequestProperty("User-Agent", DESKTOP_UA)
                if (contentType.isNotEmpty()) c.setRequestProperty("Content-Type", contentType)
                android.webkit.CookieManager.getInstance().getCookie(target)?.let { c.setRequestProperty("Cookie", it) }
                val body = android.util.Base64.decode(bodyB64, android.util.Base64.DEFAULT)
                c.outputStream.use { it.write(body) }
                val code = c.responseCode
                saveCookies(target, c)
                val st = if (code >= 400) c.errorStream else c.inputStream
                val bytes = st?.use { it.readBytes() } ?: ByteArray(0)
                out.put("status", code)
                out.put("type", c.contentType ?: "")
                out.put("body", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP))
            } catch (e: Exception) {
                out.put("status", 502)
                out.put("type", "text/plain")
                out.put("body", android.util.Base64.encodeToString((e.message ?: "erro").toByteArray(), android.util.Base64.NO_WRAP))
            }
            return out.toString()
        }
    }

    private fun checkRuffle() {
        val js = """
            (function() {
                if (!window.RufflePlayer) return -1;
                return document.querySelectorAll('ruffle-player, ruffle-embed, ruffle-object').length;
            })();
        """.trimIndent()
        webView.evaluateJavascript(js) { result ->
            if (running) return@evaluateJavascript
            when (result?.trim()) {
                "-1", null, "null" -> setStatus("Ruffle não carregou (a página pode ter bloqueado o script)", R.color.bad)
                "0" -> setStatus("Ruffle carregou, mas nenhum jogo foi detectado na página", R.color.warn)
                else -> setStatus("Ruffle ativo: $result player(s) na página", R.color.ok)
            }
        }
    }

    private fun startBot() {
        if (running) return
        val parsed = skillsInput.text.toString().split(",", " ")
            .map { it.trim() }
            .filter { it.length == 1 }
        if (parsed.isEmpty()) {
            toast("Digite as teclas, ex: 1,2,3,4")
            return
        }
        keys = parsed
        intervalMs = (intervalInput.text.toString().toLongOrNull() ?: 1500L).coerceAtLeast(300L)
        getSharedPreferences("bot", Context.MODE_PRIVATE).edit()
            .putString("url", urlInput.text.toString())
            .putString("keys", skillsInput.text.toString())
            .putString("interval", intervalInput.text.toString())
            .apply()
        index = 0
        presses = 0
        running = true
        updateButtons()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        handler.post(tick)
    }

    private fun stopBot() {
        running = false
        handler.removeCallbacks(tick)
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        updateButtons()
        setStatus("Parado", R.color.muted)
    }

    // Simula o aperto de uma tecla (keydown + keyup) no jogo via JavaScript.
    private fun pressKey(key: String) {
        val c = key.uppercase()[0]
        val code = if (c.isDigit()) "Digit$c" else "Key$c"
        val keyCode = c.code
        val js = """
            (function() {
                function fire(type) {
                    var e = new KeyboardEvent(type, {key: '$key', code: '$code', bubbles: true, cancelable: true});
                    Object.defineProperty(e, 'keyCode', {get: function() { return $keyCode; }});
                    Object.defineProperty(e, 'which', {get: function() { return $keyCode; }});
                    var t = document.querySelector('ruffle-player, ruffle-embed, ruffle-object') || document.body;
                    t.dispatchEvent(e);
                }
                fire('keydown');
                setTimeout(function() { fire('keyup'); }, 60);
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacksAndMessages(null)
        pulse?.cancel()
        bridge?.stop()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val LOCAL_HOST = "appassets.local"
        private const val DESKTOP_UA =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0.0.0 Safari/537.36"
    }
}
