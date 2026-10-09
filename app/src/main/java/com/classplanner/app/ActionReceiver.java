package com.classplanner.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Handles the Attended / Missed / Condonation buttons on a class notification. */
public class ActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String key = i.getStringExtra("key"), st = i.getStringExtra("st");
        if (key == null || st == null) return;
        if (!"TEST".equals(key)) Scheduler.queueMark(c, key, st);
        c.getSystemService(NotificationManager.class).cancel("c:" + key, 1);
        PlannerWidget.updateAll(c);
    }
}
