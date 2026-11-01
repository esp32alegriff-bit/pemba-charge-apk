package za.co.farrusco.farrqcharge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** Background check: woken by the alarm, by Wi-Fi connecting, or by the phone restarting. Runs a few seconds, then sleeps. */
public class PollReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final Context c = context.getApplicationContext();
        final String action = intent == null ? "" : String.valueOf(intent.getAction());
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Poller.kick(c);
            return;
        }
        if (Poller.ACTION_NET.equals(action)) {
            // Wi-Fi callbacks can arrive in bursts; one check per minute is plenty.
            if (System.currentTimeMillis() - Store.getLong(c, "lastPoll", 0) < 60_000) return;
        }
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                JSONObject r = Poller.sync(c);
                Poller.schedule(c, Poller.nextDelay(r, c));
            } catch (Throwable t) {
                Poller.schedule(c, Poller.UNREACHABLE_MS);
            } finally {
                pr.finish();
            }
        }, "farrq-poll").start();
    }
}
