package com.classplanner.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Home-screen widget: today's classes and what is due, read from the list the page last saved. */
public class PlannerWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static void updateAll(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, PlannerWidget.class));
            if (ids.length > 0) for (int id : ids) m.updateAppWidget(id, build(c));
        } catch (Exception ignored) { }
    }

    private static final int[] ROW = { R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5 };
    private static final int[] NAME = { R.id.w_n1, R.id.w_n2, R.id.w_n3, R.id.w_n4, R.id.w_n5 };
    private static final int[] YES = { R.id.w_a1, R.id.w_a2, R.id.w_a3, R.id.w_a4, R.id.w_a5 };
    private static final int[] NO = { R.id.w_m1, R.id.w_m2, R.id.w_m3, R.id.w_m4, R.id.w_m5 };
    private static final int[] DONE = { R.id.w_s1, R.id.w_s2, R.id.w_s3, R.id.w_s4, R.id.w_s5 };

    private static PendingIntent markIntent(Context c, String key, String st) {
        Intent i = new Intent(c, ActionReceiver.class);
        i.setAction("cp.mark");
        i.setData(Uri.parse("cp://mark/" + Uri.encode(key) + "/" + st));
        i.putExtra("key", key); i.putExtra("st", st);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String label = new SimpleDateFormat("EEE, d MMM", Locale.getDefault()).format(new Date());
        String classes = "Open Class Planner to refresh", due = "", more = "";
        JSONArray items = null;
        try {
            String json = Scheduler.prefs(c).getString("data", null);
            if (json != null) {
                JSONArray days = new JSONObject(json).optJSONArray("days");
                if (days != null) for (int k = 0; k < days.length(); k++) {
                    JSONObject d = days.getJSONObject(k);
                    if (!today.equals(d.optString("d"))) continue;
                    classes = join(d.optJSONArray("classes"), "No classes today");
                    due = join(d.optJSONArray("due"), "");
                    if (due.length() > 0) due = "Due:\n" + due;
                    items = d.optJSONArray("items");
                    break;
                }
            }
        } catch (Exception ignored) { }
        v.setTextViewText(R.id.w_date, label);
        v.setTextViewText(R.id.w_due, due);
        boolean rows = items != null && items.length() > 0;
        // rows with tick / cross buttons when the page sent per-class items; plain text otherwise
        v.setViewVisibility(R.id.w_classes, rows ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_classes, classes);
        for (int i = 0; i < ROW.length; i++) {
            if (!rows || i >= items.length()) { v.setViewVisibility(ROW[i], View.GONE); continue; }
            JSONObject it = items.optJSONObject(i);
            if (it == null) { v.setViewVisibility(ROW[i], View.GONE); continue; }
            String key = it.optString("key"), st = it.optString("st");
            v.setViewVisibility(ROW[i], View.VISIBLE);
            v.setTextViewText(NAME[i], it.optString("t") + "  " + it.optString("n"));
            boolean marked = "A".equals(st) || "M".equals(st) || "C".equals(st);
            boolean started = it.optInt("s", 0) == 1;
            v.setViewVisibility(YES[i], !marked && started ? View.VISIBLE : View.GONE);
            v.setViewVisibility(NO[i], !marked && started ? View.VISIBLE : View.GONE);
            v.setViewVisibility(DONE[i], marked ? View.VISIBLE : View.GONE);
            if (marked) {
                v.setTextViewText(DONE[i], "M".equals(st) ? "✗" : "✓");
                v.setTextColor(DONE[i], c.getColor("M".equals(st) ? R.color.w_bad : R.color.w_ok));
            } else if (started) {
                v.setOnClickPendingIntent(YES[i], markIntent(c, key, "A"));
                v.setOnClickPendingIntent(NO[i], markIntent(c, key, "M"));
            }
        }
        if (rows && items.length() > ROW.length) more = "+" + (items.length() - ROW.length) + " more in the app";
        v.setViewVisibility(R.id.w_more, more.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_more, more);
        v.setViewVisibility(R.id.w_due, due.isEmpty() ? View.GONE : View.VISIBLE);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    private static String join(JSONArray a, String empty) {
        if (a == null || a.length() == 0) return empty;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < a.length(); i++) { if (i > 0) sb.append('\n'); sb.append(a.optString(i)); }
        return sb.toString();
    }
}
