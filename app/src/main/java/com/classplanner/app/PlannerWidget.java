package com.classplanner.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
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

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String label = new SimpleDateFormat("EEE, d MMM", Locale.getDefault()).format(new Date());
        String classes = "Open Class Planner to refresh", due = "";
        try {
            String json = Scheduler.prefs(c).getString("data", null);
            if (json != null) {
                JSONArray days = new JSONObject(json).optJSONArray("days");
                if (days != null) for (int k = 0; k < days.length(); k++) {
                    JSONObject d = days.getJSONObject(k);
                    if (!today.equals(d.optString("d"))) continue;
                    classes = join(d.optJSONArray("classes"), "No classes today");
                    due = "Due:\n" + join(d.optJSONArray("due"), "Nothing due");
                    break;
                }
            }
        } catch (Exception ignored) { }
        v.setTextViewText(R.id.w_date, label);
        v.setTextViewText(R.id.w_classes, classes);
        v.setTextViewText(R.id.w_due, due);
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
