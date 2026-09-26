package hr.erpwms.mdm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.wifi.WifiNetworkSuggestion
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.StatFs
import android.os.UserManager
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/** Periodično javljanje (najkraće 15 min na Androidu), naredbe, profil, aplikacije i datoteke. */
class AgentWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    private val dpm = ctx.getSystemService(DevicePolicyManager::class.java)
    private val admin = AdminReceiver.komponenta(ctx)
    private val zapisi = JSONArray()

    private fun zapisi(razina: String, poruka: String) {
        zapisi.put(JSONObject().put("razina", razina).put("poruka", poruka).put("vrijeme", java.time.Instant.now().toString()))
    }

    override suspend fun doWork(): Result {
        val p = Postavke(applicationContext)
        val adresa = p.adresa ?: return Result.success()
        val api = Api(adresa, p.token)
        val odgovor = try {
            api.json("/api/mdm/javi", JSONObject().put("izvjestaj", izvjestaj()))
        } catch (e: Api.Neovlasteno) {
            return Result.success()
        } catch (e: Exception) {
            return Result.retry()
        }
        try { primijeniProfil(odgovor.optJSONObject("profil"), p) } catch (e: Exception) { zapisi("GRESKA", "Profil: ${e.message}") }
        val aplikacije = odgovor.optJSONArray("aplikacije") ?: JSONArray()
        try { datoteke(api, odgovor.optJSONArray("datoteke") ?: JSONArray()) } catch (e: Exception) { zapisi("GRESKA", "Datoteke: ${e.message}") }
        val naredbe = odgovor.optJSONArray("naredbe") ?: JSONArray()
        val izvrsene = p.izvrsene.toMutableSet()
        for (i in 0 until naredbe.length()) {
            val n = naredbe.getJSONObject(i)
            val id = n.getString("id")
            if (id in izvrsene) continue
            val (uspjeh, poruka) = try { true to izvrsi(n, api, aplikacije) } catch (e: Exception) { false to (e.message ?: "Greška") }
            runCatching { api.json("/api/mdm/rezultat", JSONObject().put("naredbaId", id).put("uspjeh", uspjeh).put("poruka", poruka)) }
            zapisi(if (uspjeh) "INFO" else "GRESKA", "${n.getString("vrsta")}: $poruka")
            izvrsene += id
            p.izvrsene = izvrsene
        }
        if (zapisi.length() > 0) runCatching { api.json("/api/mdm/zapisnik", JSONObject().put("zapisi", zapisi)) }
        return Result.success()
    }

    private fun izvjestaj(): JSONObject {
        val bat = applicationContext.getSystemService(BatteryManager::class.java).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val fs = StatFs(applicationContext.filesDir.absolutePath)
        val apl = JSONArray()
        for (pi in applicationContext.packageManager.getInstalledPackages(0)) {
            if ((pi.applicationInfo?.flags ?: 0) and android.content.pm.ApplicationInfo.FLAG_SYSTEM != 0) continue
            apl.put(JSONObject().put("paket", pi.packageName).put("verzijaKod", pi.longVersionCode))
        }
        return JSONObject()
            .put("baterija", bat)
            .put("slobodnoGB", Math.round(fs.availableBytes / 1e8) / 10.0)
            .put("verzijaAgenta", BuildConfigInfo.VERZIJA)
            .put("aplikacije", apl)
    }

    private fun izvrsi(n: JSONObject, api: Api, aplikacije: JSONArray): String {
        val par = n.optJSONObject("parametri") ?: JSONObject()
        return when (n.getString("vrsta")) {
            "ZAKLJUCAJ" -> { dpm.lockNow(); "Zaslon zaključan." }
            "PONOVNO_POKRENI" -> { dpm.reboot(admin); "Ponovno pokretanje." }
            "OBRISI_PODATKE" -> { dpm.wipeData(0); "Brisanje pokrenuto." }
            "PORUKA" -> { obavijest(par.getString("tekst")); "Poruka prikazana." }
            "POSALJI_ZAPISNIK" -> "Zapisnik poslan."
            "INSTALIRAJ" -> {
                val id = par.getString("aplikacijaId")
                val a = (0 until aplikacije.length()).map { aplikacije.getJSONObject(it) }.firstOrNull { it.getString("id") == id }
                    ?: throw IllegalStateException("Aplikacija nije dodijeljena.")
                val apk = File(applicationContext.cacheDir, "${a.getString("paket")}.apk")
                api.preuzmi(a.getString("adresa"), a.getString("sha256"), apk)
                instaliraj(apk)
                "Instalacija ${a.getString("paket")} ${a.getString("verzija")} pokrenuta."
            }
            "DEINSTALIRAJ" -> {
                val pi = PendingIntent.getBroadcast(applicationContext, 0, Intent("hr.erpwms.mdm.UKLONI"), PendingIntent.FLAG_IMMUTABLE)
                applicationContext.packageManager.packageInstaller.uninstall(par.getString("paket"), pi.intentSender)
                "Uklanjanje ${par.getString("paket")} pokrenuto."
            }
            else -> throw IllegalStateException("Naredba nije podržana na Androidu.")
        }
    }

    /** Device Owner instalira bez pitanja korisnika (PackageInstaller sesija). */
    private fun instaliraj(apk: File) {
        val pi = applicationContext.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        val id = pi.createSession(params)
        pi.openSession(id).use { s ->
            s.openWrite("apk", 0, apk.length()).use { iz -> apk.inputStream().use { it.copyTo(iz) }; s.fsync(iz) }
            val povrat = PendingIntent.getBroadcast(applicationContext, id, Intent("hr.erpwms.mdm.INSTALIRANO"), PendingIntent.FLAG_IMMUTABLE)
            s.commit(povrat.intentSender)
        }
        apk.delete()
    }

    private fun primijeniProfil(pr: JSONObject?, p: Postavke) {
        if (pr == null || pr.getInt("verzija") == p.verzijaProfila) return
        if (!pr.isNull("lozinkaMin")) {
            @Suppress("DEPRECATION")
            dpm.setPasswordQuality(admin, DevicePolicyManager.PASSWORD_QUALITY_NUMERIC)
            @Suppress("DEPRECATION")
            dpm.setPasswordMinimumLength(admin, pr.getInt("lozinkaMin"))
        }
        if (!pr.isNull("zakljucajNakonMin")) dpm.setMaximumTimeToLock(admin, pr.getInt("zakljucajNakonMin") * 60_000L)
        dpm.setCameraDisabled(admin, !pr.optBoolean("kameraDopustena", true))
        if (pr.optBoolean("usbDopusten", true)) dpm.clearUserRestriction(admin, UserManager.DISALLOW_USB_FILE_TRANSFER)
        else dpm.addUserRestriction(admin, UserManager.DISALLOW_USB_FILE_TRANSFER)
        val ssid = pr.optString("wifiSsid", "")
        val lozinka = pr.optString("wifiLozinka", "")
        if (ssid.isNotEmpty() && lozinka.isNotEmpty()) {
            val prijedlog = WifiNetworkSuggestion.Builder().setSsid(ssid).setWpa2Passphrase(lozinka).build()
            applicationContext.getSystemService(WifiManager::class.java).addNetworkSuggestions(listOf(prijedlog))
        }
        val kiosk = pr.optString("kiosk", "")
        dpm.setLockTaskPackages(admin, if (kiosk.isNotEmpty()) arrayOf(kiosk, applicationContext.packageName) else arrayOf())
        p.verzijaProfila = pr.getInt("verzija")
        zapisi("INFO", "Primijenjen profil v${pr.getInt("verzija")}.")
    }

    private fun datoteke(api: Api, lista: JSONArray) {
        for (i in 0 until lista.length()) {
            val d = lista.getJSONObject(i)
            val mapa = File(applicationContext.getExternalFilesDir(null), d.getString("putanja")).apply { mkdirs() }
            val cilj = File(mapa, d.getString("naziv"))
            if (cilj.exists() && sha(cilj) == d.getString("sha256")) continue
            api.preuzmi(d.getString("adresa"), d.getString("sha256"), cilj)
            zapisi("INFO", "Datoteka ${d.getString("naziv")} spremljena.")
        }
    }

    private fun sha(f: File): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        f.inputStream().use { ul -> val b = ByteArray(65536); while (true) { val n = ul.read(b); if (n < 0) break; md.update(b, 0, n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun obavijest(tekst: String) {
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("mdm", "Poruke administratora", NotificationManager.IMPORTANCE_HIGH))
        nm.notify(System.currentTimeMillis().toInt(), NotificationCompat.Builder(applicationContext, "mdm")
            .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Poruka administratora").setContentText(tekst)
            .setStyle(NotificationCompat.BigTextStyle().bigText(tekst)).build())
    }

    companion object {
        fun zakazi(ctx: Context) {
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                "erp-mdm", ExistingPeriodicWorkPolicy.UPDATE, PeriodicWorkRequestBuilder<AgentWorker>(15, TimeUnit.MINUTES).build(),
            )
        }
    }
}
