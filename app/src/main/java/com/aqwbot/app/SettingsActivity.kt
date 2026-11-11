package com.aqwbot.app

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val versionText = findViewById<TextView>(R.id.versionText)
        val updateStatus = findViewById<TextView>(R.id.updateStatus)
        val checkButton = findViewById<MaterialButton>(R.id.checkButton)

        versionText.text = "Versão instalada: ${Updater.installedVersionName(this)}"

        findViewById<MaterialButton>(R.id.backButton).setOnClickListener { finish() }
        findViewById<MaterialButton>(R.id.newsButton).setOnClickListener { Novidades.showLatest(this) }

        checkButton.setOnClickListener {
            checkButton.isEnabled = false
            updateStatus.text = "Procurando atualização…"
            Updater.check(this) { result ->
                if (isFinishing || isDestroyed) return@check
                checkButton.isEnabled = true
                when (result) {
                    is Updater.Result.Available -> {
                        updateStatus.text = "Nova versão disponível: ${result.release.tag}"
                        Updater.showUpdateDialog(this, result.release)
                    }
                    is Updater.Result.UpToDate -> updateStatus.text = "Você já está na versão mais nova."
                    is Updater.Result.NoInternet -> updateStatus.text = "Sem internet. Tente de novo mais tarde."
                    is Updater.Result.Error -> updateStatus.text = "Não foi possível verificar agora."
                }
            }
        }
    }
}
