package hr.erpwms.mdm

import android.content.Context
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import kotlin.concurrent.thread

object Upis {
    /** Upis kodom organizacije; nakon uspjeha pokreće periodično javljanje. */
    fun upisi(ctx: Context, adresa: String, kod: String, gotovo: (String?) -> Unit = {}) = thread {
        try {
            val serijski = try { Build.getSerial() } catch (e: SecurityException) { Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) }
            val r = Api(adresa, null).json(
                "/api/mdm/upis",
                JSONObject()
                    .put("kod", kod).put("serijski", serijski).put("platforma", "ANDROID")
                    .put("naziv", Settings.Global.getString(ctx.contentResolver, Settings.Global.DEVICE_NAME))
                    .put("model", "${Build.MANUFACTURER} ${Build.MODEL}").put("osVerzija", Build.VERSION.RELEASE)
                    .put("verzijaAgenta", BuildConfigInfo.VERZIJA),
            )
            val p = Postavke(ctx)
            p.adresa = adresa
            p.token = r.getString("token")
            AgentWorker.zakazi(ctx)
            gotovo(null)
        } catch (e: Exception) {
            gotovo(e.message ?: "Upis nije uspio.")
        }
    }
}

object BuildConfigInfo { const val VERZIJA = "1.0.0" }
