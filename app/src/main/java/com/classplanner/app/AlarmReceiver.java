package com.classplanner.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String kind = i.getStringExtra("kind");
        if ("b".equals(kind)) { BackupAlarm.run(c.getApplicationContext(), goAsync()); return; }
        if ("c".equals(kind) || "t".equals(kind)) {
            Scheduler.notifyNow(c, kind, i.getStringExtra("ref"), i.getStringExtra("title"), i.getStringExtra("text"));
        }
        PlannerWidget.updateAll(c);
    }
}
