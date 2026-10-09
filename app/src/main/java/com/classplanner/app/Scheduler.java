package com.classplanner.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** Keeps the page's reminder list on the phone and turns it into alarms, notifications and widget text. Nothing leaves the device. */
final class Scheduler {
    static final String PREFS = "cp_native";
    static final String CH_CLASS = "classes", CH_DUE = "due";
    private static final Object LOCK = new Object();

    private Scheduler() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void ensureChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_CLASS, "Class check-ins", NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(new NotificationChannel(CH_DUE, "Assignment reminders", NotificationManager.IMPORTANCE_HIGH));
    }

    /** Called with the JSON the page builds (classes, tasks, widget days). */
    static void apply(Context c, String json) {
        synchronized (LOCK) {
            prefs(c).edit().putString("data", json).apply();
            schedule(c, json);
        }
        PlannerWidget.updateAll(c);
    }

    static void reschedule(Context c) {
        String json = prefs(c).getString("data", null);
        synchronized (LOCK) { if (json != null) schedule(c, json); }
        PlannerWidget.updateAll(c);
    }

    private static PendingIntent alarmIntent(Context c, String id, Intent extras, int flags) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction("cp.alarm");
        i.setData(Uri.parse("cp://alarm/" + Uri.encode(id)));
        if (extras != null) i.putExtras(extras);
        return PendingIntent.getBroadcast(c, 0, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void schedule(Context c, String json) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        SharedPreferences p = prefs(c);
        // cancel what was scheduled last time
        try {
            JSONArray old = new JSONArray(p.getString("ids", "[]"));
            for (int k = 0; k < old.length(); k++) {
                PendingIntent pi = alarmIntent(c, old.getString(k), null, PendingIntent.FLAG_NO_CREATE);
                if (pi != null) { am.cancel(pi); pi.cancel(); }
            }
        } catch (Exception ignored) { }
        JSONArray ids = new JSONArray();
        long now = System.currentTimeMillis();
        try {
            JSONObject o = new JSONObject(json);
            ensureChannels(c);
            JSONArray cls = o.optJSONArray("classes");
            JSONArray keep = new JSONArray();
            if (cls != null) for (int k = 0; k < cls.length(); k++) {
                JSONObject x = cls.getJSONObject(k);
                long at = x.getLong("at");
                if (at <= now) continue;
                put(c, am, ids, "c:" + x.getString("key"), at, "c", x.getString("key"), x.getString("title"), x.optString("text"));
                keep.put(x.getString("key"));
            }
            JSONArray tasks = o.optJSONArray("tasks");
            if (tasks != null) for (int k = 0; k < tasks.length(); k++) {
                JSONObject x = tasks.getJSONObject(k);
                long at = x.getLong("at");
                if (at <= now) continue;
                put(c, am, ids, "t:" + x.getString("id"), at, "t", x.getString("id"), x.getString("title"), x.optString("text"));
            }
            // refresh the widget just after midnight
            Calendar m = Calendar.getInstance();
            m.add(Calendar.DAY_OF_YEAR, 1);
            m.set(Calendar.HOUR_OF_DAY, 0); m.set(Calendar.MINUTE, 1); m.set(Calendar.SECOND, 0); m.set(Calendar.MILLISECOND, 0);
            put(c, am, ids, "w:midnight", m.getTimeInMillis(), "w", "", "", "");
            // drop notifications for classes the user has since marked in the app
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                String tag = sbn.getTag();
                if (tag != null && tag.startsWith("c:") && !contains(keep, tag.substring(2)) && !"TEST".equals(tag.substring(2))) nm.cancel(tag, sbn.getId());
            }
        } catch (Exception ignored) { }
        p.edit().putString("ids", ids.toString()).apply();
    }

    private static boolean contains(JSONArray a, String s) {
        for (int i = 0; i < a.length(); i++) if (s.equals(a.optString(i))) return true;
        return false;
    }

    private static void put(Context c, AlarmManager am, JSONArray ids, String id, long at, String kind, String ref, String title, String text) {
        Intent e = new Intent();
        e.putExtra("kind", kind); e.putExtra("ref", ref); e.putExtra("title", title); e.putExtra("text", text);
        PendingIntent pi = alarmIntent(c, id, e, PendingIntent.FLAG_UPDATE_CURRENT);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        ids.put(id);
    }

    static void notifyNow(Context c, String kind, String ref, String title, String text) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannels(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean cls = "c".equals(kind);
        Notification.Builder b = new Notification.Builder(c, cls ? CH_CLASS : CH_DUE)
            .setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(text)
            .setContentIntent(content).setAutoCancel(true).setCategory(cls ? Notification.CATEGORY_EVENT : Notification.CATEGORY_REMINDER);
        String tag = (cls ? "c:" : "t:") + ref;
        if (cls) {
            String[][] acts = { { "A", "Attended" }, { "M", "Missed" }, { "C", "Condonation" } };
            for (String[] a : acts) {
                Intent i = new Intent(c, ActionReceiver.class);
                i.setAction("cp.mark");
                i.setData(Uri.parse("cp://mark/" + Uri.encode(ref) + "/" + a[0]));
                i.putExtra("key", ref); i.putExtra("st", a[0]);
                PendingIntent pi = PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_stat), a[1], pi).build());
            }
        }
        nm.notify(tag, 1, b.build());
    }

    /** Called by the notification buttons: remember the answer until the page next opens. */
    static void queueMark(Context c, String key, String st) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            try {
                JSONArray a = new JSONArray(p.getString("pending", "[]"));
                a.put(new JSONObject().put("key", key).put("st", st));
                p.edit().putString("pending", a.toString()).apply();
                // drop it from the stored list so the widget and a later reschedule know it is done
                String json = p.getString("data", null);
                if (json != null) {
                    JSONObject o = new JSONObject(json);
                    JSONArray cls = o.optJSONArray("classes"), left = new JSONArray();
                    if (cls != null) for (int k = 0; k < cls.length(); k++) if (!key.equals(cls.getJSONObject(k).optString("key"))) left.put(cls.get(k));
                    o.put("classes", left);
                    // widget rows: show the new answer straight away
                    JSONArray days = o.optJSONArray("days");
                    if (days != null) for (int k = 0; k < days.length(); k++) {
                        JSONArray items = days.getJSONObject(k).optJSONArray("items");
                        if (items != null) for (int q = 0; q < items.length(); q++) {
                            JSONObject it = items.getJSONObject(q);
                            if (key.equals(it.optString("key"))) it.put("st", st);
                        }
                    }
                    p.edit().putString("data", o.toString()).apply();
                }
            } catch (Exception ignored) { }
        }
    }

    static String takePending(Context c) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            String s = p.getString("pending", "[]");
            if ("[]".equals(s)) return "[]";
            p.edit().putString("pending", "[]").apply();
            return s;
        }
    }
}
