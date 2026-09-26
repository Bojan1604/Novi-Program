package hr.erpwms.mdm

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/** Ručni upis: adresa poslužitelja i kod organizacije (ili ih postavlja QR pri postavljanju uređaja). */
class UpisActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val p = Postavke(this)
        val stanje = TextView(this)
        val adresa = EditText(this).apply { hint = "https://erp.firma.hr"; setText(p.adresa ?: "") }
        val kod = EditText(this).apply { hint = "Kod upisa (ABCD-EFGH-JKMN)" }
        val gumb = Button(this).apply { text = "Upiši uređaj" }
        gumb.setOnClickListener {
            stanje.text = "Upisujem…"
            Upis.upisi(this, adresa.text.toString().trim(), kod.text.toString()) { g -> runOnUiThread { stanje.text = g ?: "Uređaj je upisan." } }
        }
        if (p.upisan) stanje.text = "Uređaj je upisan (${p.adresa})."
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
            addView(TextView(this@UpisActivity).apply { text = "ERP-WMS MDM"; textSize = 22f })
            addView(adresa); addView(kod); addView(gumb); addView(stanje)
        })
    }
}
