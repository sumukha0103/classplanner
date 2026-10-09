package com.classplanner.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import java.util.Calendar;

/** Nightly Drive backup: an inexact alarm around 10 pm. If the phone is offline the attempt is repeated every two hours (up to four times). */
final class BackupAlarm {
    private BackupAlarm() { }

    private static PendingIntent pi(Context c, int flags) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction("cp.backup");
        i.setData(Uri.parse("cp://backup"));
        i.putExtra("kind", "b");
        return PendingIntent.getBroadcast(c, 0, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static void setEnabled(Context c, boolean on) {
        CloudStore.prefs(c).edit().putBoolean("bk_on", on).apply();
        if (on) schedule(c, false); else cancel(c);
    }

    static void cancel(Context c) {
        PendingIntent p = pi(c, PendingIntent.FLAG_NO_CREATE);
        if (p != null) { c.getSystemService(AlarmManager.class).cancel(p); p.cancel(); }
    }

    static boolean enabled(Context c) { return CloudStore.prefs(c).getBoolean("bk_on", false); }

    /** @param retry true after a failed attempt: try again in two hours instead of waiting for tomorrow night. */
    static void schedule(Context c, boolean retry) {
        if (!enabled(c)) return;
        SharedPreferences p = CloudStore.prefs(c);
        long at;
        if (retry && p.getInt("bk_fail", 0) > 0 && p.getInt("bk_fail", 0) <= 4) at = System.currentTimeMillis() + 2 * 3600_000L;
        else {
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 22); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
            if (cal.getTimeInMillis() <= System.currentTimeMillis() + 60_000L) cal.add(Calendar.DAY_OF_MONTH, 1);
            at = cal.getTimeInMillis();
        }
        c.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(c, PendingIntent.FLAG_UPDATE_CURRENT));
    }

    /** Alarm fired (or the phone was restarted while a backup was overdue). */
    static void run(final Context app, final android.content.BroadcastReceiver.PendingResult pr) {
        new Thread(() -> {
            try {
                if (enabled(app)) {
                    String r = CloudStore.backupNow(app);
                    schedule(app, !"ok".equals(r));
                }
            } finally { if (pr != null) pr.finish(); }
        }).start();
    }
}
