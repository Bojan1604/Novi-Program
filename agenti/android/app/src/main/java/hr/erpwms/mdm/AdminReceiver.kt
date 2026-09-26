package hr.erpwms.mdm

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Device Owner. Postavljanje: QR Android Enterprise (PROVISIONING_ADMIN_EXTRAS_BUNDLE s „adresa“ i „kod“)
 * ili za testiranje: adb shell dpm set-device-owner hr.erpwms.mdm/.AdminReceiver
 */
class AdminReceiver : DeviceAdminReceiver() {
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        val extras = intent.getParcelableExtra<android.os.PersistableBundle>(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
        val adresa = extras?.getString("adresa")
        val kod = extras?.getString("kod")
        if (adresa != null && kod != null) Upis.upisi(context, adresa, kod)
    }

    companion object {
        fun komponenta(ctx: Context) = ComponentName(ctx, AdminReceiver::class.java)
    }
}
