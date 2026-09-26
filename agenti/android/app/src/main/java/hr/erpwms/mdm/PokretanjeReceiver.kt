package hr.erpwms.mdm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PokretanjeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Postavke(context).upisan) AgentWorker.zakazi(context)
    }
}
