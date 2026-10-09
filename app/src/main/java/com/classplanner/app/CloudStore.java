package com.classplanner.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.database.Cursor;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** The two files the user picked in the system file screen (Google Drive, usually): the nightly backup and the sync file.
 *  The app never talks to the internet itself; Android's Drive app does the upload when we write to the chosen file. */
final class CloudStore {
    static final String PREFS = "cp_cloud";
    private static final Object LOCK = new Object();

    private CloudStore() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void setTarget(Context c, String kind, Uri uri, String name) {
        prefs(c).edit().putString("uri_" + kind, uri.toString()).putString("name_" + kind, name == null ? "" : name).apply();
    }

    static void clearTarget(Context c, String kind) {
        SharedPreferences.Editor e = prefs(c).edit().remove("uri_" + kind).remove("name_" + kind);
        if ("backup".equals(kind)) e.putBoolean("bk_on", false).remove("bk_at").remove("bk_ok").remove("bk_err").remove("bk_fail");
        e.apply();
        if ("backup".equals(kind)) new File(c.getFilesDir(), "staged.cpbackup").delete();
    }

    static Uri target(Context c, String kind) {
        String s = prefs(c).getString("uri_" + kind, null);
        return s == null ? null : Uri.parse(s);
    }

    static String displayName(Context c, Uri uri) {
        try (Cursor q = c.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (q != null && q.moveToFirst()) return q.getString(0);
        } catch (Exception ignored) { }
        return "";
    }

    static String info(Context c, String kind) {
        JSONObject o = new JSONObject();
        try {
            Uri u = target(c, kind);
            o.put("set", u != null);
            if (u != null) {
                String auth = u.getAuthority() == null ? "" : u.getAuthority();
                o.put("name", prefs(c).getString("name_" + kind, ""));
                o.put("auth", auth);
                o.put("drive", auth.startsWith("com.google.android.apps.docs"));
            }
        } catch (Exception ignored) { }
        return o.toString();
    }

    static byte[] read(Context c, String kind) throws Exception {
        Uri u = target(c, kind);
        if (u == null) throw new IllegalStateException("No file has been chosen.");
        try (InputStream in = c.getContentResolver().openInputStream(u)) {
            if (in == null) throw new IllegalStateException("The file could not be opened.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    static void write(Context c, String kind, byte[] data) throws Exception {
        Uri u = target(c, kind);
        if (u == null) throw new IllegalStateException("No file has been chosen.");
        OutputStream os;
        try { os = c.getContentResolver().openOutputStream(u, "wt"); }
        catch (Exception first) { if (first instanceof SecurityException) throw first; os = c.getContentResolver().openOutputStream(u, "w"); }
        if (os == null) throw new IllegalStateException("The file could not be opened for writing.");
        try { os.write(data); os.flush(); } finally { os.close(); }
    }

    /** Human wording for the usual ways this goes wrong. */
    static String explain(Exception e) {
        if (e instanceof SecurityException) return "Permission to the Drive file was lost. Choose it again.";
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }

    static void stage(Context c, byte[] data) throws Exception {
        synchronized (LOCK) {
            File tmp = new File(c.getFilesDir(), "staged.tmp"), dst = new File(c.getFilesDir(), "staged.cpbackup");
            try (FileOutputStream f = new FileOutputStream(tmp)) { f.write(data); f.getFD().sync(); }
            if (!tmp.renameTo(dst)) throw new IllegalStateException("Could not stage the backup.");
        }
    }

    /** Writes the staged (already encrypted) backup to the chosen Drive file. Returns "ok" or "ERR:...". */
    static String backupNow(Context c) {
        SharedPreferences p = prefs(c);
        synchronized (LOCK) {
            try {
                File f = new File(c.getFilesDir(), "staged.cpbackup");
                if (!f.exists()) throw new IllegalStateException("Nothing to back up yet. Open the app once.");
                byte[] data = new byte[(int) f.length()];
                try (InputStream in = new java.io.FileInputStream(f)) {
                    int off = 0, n;
                    while (off < data.length && (n = in.read(data, off, data.length - off)) > 0) off += n;
                }
                write(c, "backup", data);
                p.edit().putLong("bk_at", System.currentTimeMillis()).putBoolean("bk_ok", true).remove("bk_err").putInt("bk_fail", 0).apply();
                return "ok";
            } catch (Exception e) {
                String why = explain(e);
                p.edit().putBoolean("bk_ok", false).putString("bk_err", why).putInt("bk_fail", p.getInt("bk_fail", 0) + 1).apply();
                return "ERR:" + why;
            }
        }
    }

    static String status(Context c) {
        SharedPreferences p = prefs(c);
        JSONObject o = new JSONObject();
        try {
            if (p.contains("bk_at")) o.put("at", p.getLong("bk_at", 0));
            if (p.contains("bk_ok")) o.put("ok", p.getBoolean("bk_ok", true));
            if (p.contains("bk_err")) o.put("err", p.getString("bk_err", ""));
        } catch (Exception ignored) { }
        return o.toString();
    }
}
