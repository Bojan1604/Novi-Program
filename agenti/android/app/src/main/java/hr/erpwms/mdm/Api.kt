package hr.erpwms.mdm

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** HTTPS pozivi prema poslužitelju (protokol: agenti/PROTOKOL.md). */
class Api(private val adresa: String, private val token: String?) {
    class Neovlasteno : Exception("Uređaj je blokiran ili nije upisan.")

    private fun veza(put: String, metoda: String): HttpURLConnection =
        (URL(adresa.trimEnd('/') + put).openConnection() as HttpURLConnection).apply {
            requestMethod = metoda
            connectTimeout = 30_000
            readTimeout = 60_000
            token?.let { setRequestProperty("Authorization", "Bearer $it") }
        }

    fun json(put: String, tijelo: JSONObject): JSONObject {
        val c = veza(put, "POST")
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        c.outputStream.use { it.write(tijelo.toString().toByteArray()) }
        if (c.responseCode == 401) throw Neovlasteno()
        val tekst = (if (c.responseCode < 400) c.inputStream else c.errorStream).bufferedReader().readText()
        val r = JSONObject(tekst)
        if (c.responseCode >= 400) throw IllegalStateException(r.optString("greska", "HTTP ${c.responseCode}"))
        return r
    }

    /** Preuzimanje s provjerom SHA-256 (datoteka se briše ako ne odgovara). */
    fun preuzmi(put: String, sha256: String, cilj: File) {
        val c = veza(put, "GET")
        if (c.responseCode != 200) throw IllegalStateException("Preuzimanje: HTTP ${c.responseCode}")
        val md = MessageDigest.getInstance("SHA-256")
        c.inputStream.use { ul -> cilj.outputStream().use { iz ->
            val b = ByteArray(64 * 1024)
            while (true) { val n = ul.read(b); if (n < 0) break; md.update(b, 0, n); iz.write(b, 0, n) }
        } }
        val h = md.digest().joinToString("") { "%02x".format(it) }
        if (h != sha256.lowercase()) { cilj.delete(); throw IllegalStateException("SHA-256 ne odgovara.") }
    }
}
