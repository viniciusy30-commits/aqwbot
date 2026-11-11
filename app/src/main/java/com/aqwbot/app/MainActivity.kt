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
            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(rufflePayload, null)
                // Depois de alguns segundos, confere se o Ruffle assumiu algum player.
                handler.postDelayed({ checkRuffle() }, 4000)
            }
        }
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
                if (webView.canGoBack()) webView.goBack() else finish()
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
        if (!url.startsWith("http")) url = "https://$url"
        if (!running) setStatus("Carregando…", R.color.warn)
        webView.loadUrl(url)
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
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val DESKTOP_UA =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0.0.0 Safari/537.36"
    }
}
