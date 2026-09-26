package hr.erpwms.mdm

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Adresa, token i lokalno stanje — šifrirano (token je tajna uređaja). */
class Postavke(ctx: Context) {
    private val p: SharedPreferences = EncryptedSharedPreferences.create(
        ctx,
        "erp_mdm",
        MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    var adresa: String? get() = p.getString("adresa", null); set(v) = p.edit().putString("adresa", v).apply()
    var token: String? get() = p.getString("token", null); set(v) = p.edit().putString("token", v).apply()
    var verzijaProfila: Int get() = p.getInt("profil", 0); set(v) = p.edit().putInt("profil", v).apply()
    var izvrsene: Set<String> get() = p.getStringSet("izvrsene", emptySet()) ?: emptySet(); set(v) = p.edit().putStringSet("izvrsene", v.toList().takeLast(500).toSet()).apply()
    val upisan get() = adresa != null && token != null
}
