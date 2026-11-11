package com.aqwbot.app

import android.app.Activity
import android.content.Context
import android.graphics.Typeface
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.material.dialog.MaterialAlertDialogBuilder

/** Le assets/novidades.txt e mostra a secao mais nova (a primeira do arquivo). */
object Novidades {
    private const val PREFS = "novidades"
    private const val KEY_SEEN = "last_seen_id"

    class Entry(val id: String, val title: String, val items: List<String>)

    fun load(context: Context): List<Entry> {
        val text = try {
            context.assets.open("novidades.txt").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            return emptyList()
        }
        val list = ArrayList<Entry>()
        var id: String? = null
        var title = ""
        var items = ArrayList<String>()
        fun flush() {
            val i = id
            if (i != null) list.add(Entry(i, title, items))
        }
        for (raw in text.lines()) {
            val line = raw.trim()
            when {
                line.startsWith("#id") -> {
                    flush()
                    id = line.removePrefix("#id").trim()
                    title = ""
                    items = ArrayList()
                }
                line.startsWith("#titulo") -> title = line.removePrefix("#titulo").trim()
                line.startsWith("-") -> items.add(line.removePrefix("-").trim())
            }
        }
        flush()
        return list
    }

    /** Mostra na primeira abertura depois de uma atualizacao. Na primeira instalacao so registra. */
    fun showIfNew(activity: Activity) {
        val latest = load(activity).firstOrNull() ?: return
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val seen = prefs.getString(KEY_SEEN, null)
        prefs.edit().putString(KEY_SEEN, latest.id).apply()
        if (seen != null && seen != latest.id) show(activity, latest)
    }

    fun showLatest(activity: Activity) {
        val latest = load(activity).firstOrNull() ?: return
        show(activity, latest)
    }

    private fun show(activity: Activity, entry: Entry) {
        val d = activity.resources.displayMetrics.density
        val pad = (24 * d).toInt()
        val box = LinearLayout(activity)
        box.orientation = LinearLayout.VERTICAL
        box.setPadding(pad, (8 * d).toInt(), pad, 0)
        for (item in entry.items) {
            val tv = TextView(activity)
            tv.text = "•  $item"
            tv.textSize = 15f
            tv.setPadding(0, (6 * d).toInt(), 0, (6 * d).toInt())
            box.addView(tv, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        val scroll = ScrollView(activity)
        scroll.addView(box)
        val title = if (entry.title.isNotEmpty()) "O que mudou: ${entry.title}" else "O que mudou"
        MaterialAlertDialogBuilder(activity)
            .setTitle(title)
            .setView(scroll)
            .setPositiveButton("Legal", null)
            .show()
    }
}
