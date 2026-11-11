package com.aqwbot.app

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Atualizacao pelo proprio app: consulta a ultima Release do GitHub e instala o APK. */
object Updater {
    const val REPO = "viniciusy30-commits/aqwbot"
    private const val PREFS = "updater"
    private const val KEY_LAST_CHECK = "last_check"
    private const val SIX_HOURS = 6L * 60 * 60 * 1000

    class Release(val versionCode: Long, val tag: String, val apkUrl: String, val notes: String)

    sealed class Result {
        object NoInternet : Result()
        object UpToDate : Result()
        object Error : Result()
        class Available(val release: Release) : Result()
    }

    private val ui = Handler(Looper.getMainLooper())

    fun installedVersionCode(context: Context): Long {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return PackageInfoCompat.getLongVersionCode(info)
    }

    fun installedVersionName(context: Context): String {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return info.versionName ?: "?"
    }

    /** Consulta a release mais nova em segundo plano e devolve o resultado na thread principal. */
    fun check(context: Context, onResult: (Result) -> Unit) {
        val installed = installedVersionCode(context)
        thread {
            val result = try {
                val conn = URL("https://api.github.com/repos/$REPO/releases/latest")
                    .openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                conn.setRequestProperty("Accept", "application/vnd.github+json")
                val code = conn.responseCode
                if (code == 404) {
                    Result.UpToDate
                } else if (code != 200) {
                    Result.Error
                } else {
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(body)
                    val tag = json.optString("tag_name", "")
                    val remote = tag.removePrefix("v").trim().toLongOrNull()
                    var apk: String? = null
                    val assets = json.optJSONArray("assets")
                    if (assets != null) {
                        for (i in 0 until assets.length()) {
                            val a = assets.getJSONObject(i)
                            if (a.optString("name").endsWith(".apk")) {
                                apk = a.optString("browser_download_url")
                                break
                            }
                        }
                    }
                    if (remote == null || apk.isNullOrEmpty()) {
                        Result.Error
                    } else if (remote > installed) {
                        Result.Available(Release(remote, tag, apk!!, json.optString("body", "")))
                    } else {
                        Result.UpToDate
                    }
                }
            } catch (e: java.io.IOException) {
                Result.NoInternet
            } catch (e: Exception) {
                Result.Error
            }
            ui.post { onResult(result) }
        }
    }

    /** Verificacao automatica ao abrir o app: no maximo a cada 6 horas e so avisa se houver versao nova. */
    fun autoCheck(activity: Activity) {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(KEY_LAST_CHECK, 0L) < SIX_HOURS) return
        check(activity) { result ->
            if (result !is Result.NoInternet) {
                prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
            }
            if (result is Result.Available && alive(activity)) showUpdateDialog(activity, result.release)
        }
    }

    private fun alive(a: Activity) = !a.isFinishing && !a.isDestroyed

    fun showUpdateDialog(activity: Activity, release: Release) {
        val notes = release.notes.trim()
        val msg = "Versão ${release.tag.removePrefix("v")} pronta para instalar." +
            if (notes.isNotEmpty()) "\n\n$notes" else ""
        MaterialAlertDialogBuilder(activity)
            .setTitle("Nova versão disponível")
            .setMessage(msg)
            .setPositiveButton("Atualizar") { _, _ -> startDownload(activity, release) }
            .setNegativeButton("Depois", null)
            .show()
    }

    private fun canInstall(activity: Activity): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()

    private fun startDownload(activity: Activity, release: Release) {
        if (!canInstall(activity)) {
            MaterialAlertDialogBuilder(activity)
                .setTitle("Permitir instalação")
                .setMessage("Para atualizar, o Android precisa liberar “Instalar apps desconhecidos” para este app. Toque em Abrir configuração, ative a opção e volte para tentar de novo.")
                .setPositiveButton("Abrir configuração") { _, _ ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        val i = Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.packageName)
                        )
                        activity.startActivity(i)
                    }
                }
                .setNegativeButton("Cancelar", null)
                .show()
            return
        }

        val box = LinearLayout(activity)
        box.orientation = LinearLayout.VERTICAL
        val pad = (24 * activity.resources.displayMetrics.density).toInt()
        box.setPadding(pad, pad / 2, pad, 0)
        val label = TextView(activity)
        label.text = "Baixando… 0%"
        label.gravity = Gravity.START
        val bar = LinearProgressIndicator(activity)
        bar.isIndeterminate = false
        bar.max = 100
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = pad / 2
        box.addView(label)
        box.addView(bar, lp)

        var cancelled = false
        val dialog: Dialog = MaterialAlertDialogBuilder(activity)
            .setTitle("Atualizando")
            .setView(box)
            .setCancelable(false)
            .setNegativeButton("Cancelar") { _, _ -> cancelled = true }
            .show()

        thread {
            var ok = false
            var file: File? = null
            try {
                val dir = File(activity.cacheDir, "updates")
                dir.mkdirs()
                dir.listFiles()?.forEach { it.delete() }
                val target = File(dir, "AqwBot.apk")
                file = target
                val conn = URL(release.apkUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 30000
                conn.instanceFollowRedirects = true
                val total = conn.contentLength.toLong()
                conn.inputStream.use { input ->
                    FileOutputStream(target).use { out ->
                        val buf = ByteArray(16 * 1024)
                        var done = 0L
                        var lastPct = -1
                        while (!cancelled) {
                            val n = input.read(buf)
                            if (n < 0) { ok = true; break }
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct) {
                                    lastPct = pct
                                    ui.post {
                                        bar.progress = pct
                                        label.text = "Baixando… $pct%"
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                ok = false
            }
            ui.post {
                if (alive(activity)) dialog.dismiss()
                if (!alive(activity) || cancelled) return@post
                val apkFile = file
                if (ok && apkFile != null) {
                    install(activity, apkFile)
                } else {
                    MaterialAlertDialogBuilder(activity)
                        .setTitle("Falha no download")
                        .setMessage("Não foi possível baixar a atualização. Verifique a internet e tente de novo.")
                        .setPositiveButton("OK", null)
                        .show()
                }
            }
        }
    }

    private fun install(activity: Activity, file: File) {
        val uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
        intent.setDataAndType(uri, "application/vnd.android.package-archive")
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
    }
}
