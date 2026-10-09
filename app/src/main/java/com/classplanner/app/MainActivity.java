package com.classplanner.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.util.Base64;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Shows the offline Class Planner page (assets/index.html) full screen. All data stays in the WebView's local storage. */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1, REQ_BACKUP = 2, REQ_SYNC = 3;
    private static final String HOME = "file:///android_asset/index.html";

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setSupportZoom(false);
        s.setForceDark(WebSettings.FORCE_DARK_AUTO);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme()) && u.toString().startsWith("file:///android_asset/")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        if (requestCode == REQ_BACKUP || requestCode == REQ_SYNC) {
            final String kind = requestCode == REQ_BACKUP ? "backup" : "sync";
            final Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (uri == null) { js("window.__picked && window.__picked('" + kind + "', false)"); return; }
            try {
                int fl = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                getContentResolver().takePersistableUriPermission(uri, fl);
            } catch (Exception ignored) { }
            new Thread(() -> {
                CloudStore.setTarget(getApplicationContext(), kind, uri, CloudStore.displayName(getApplicationContext(), uri));
                js("window.__picked && window.__picked('" + kind + "', true)");
            }).start();
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void js(final String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }

    private void jsCb(String id, String res) { js("window.__cb(" + org.json.JSONObject.quote(id) + "," + org.json.JSONObject.quote(res) + ")"); }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Let the page close a dialog / leave the Attendance tab first; exit only when it has nothing to close.
        web.evaluateJavascript("(function(){return !!(window.__back && window.__back());})()", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        android.webkit.CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.evaluateJavascript("window.__pending && window.__pending()", null);
    }

    /** Called from the page (window.AndroidBridge.saveBackup) to write a backup file into the Downloads folder. */
    private class Bridge {
        private Uri writeDownload(String safe, String mime, byte[] data) throws Exception {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
            v.put(MediaStore.Downloads.MIME_TYPE, mime);
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("no uri");
            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                if (os == null) throw new IllegalStateException("no stream");
                os.write(data);
            }
            return uri;
        }

        @JavascriptInterface
        public void saveBackup(String name, String json) {
            try {
                String safe = name == null ? "class-planner-backup.json" : name.replaceAll("[^A-Za-z0-9._-]", "_");
                writeDownload(safe, "application/json", json.getBytes(StandardCharsets.UTF_8));
                toast("Backup saved in your Downloads folder: " + safe);
            } catch (Exception e) {
                toast("Could not save the backup.");
            }
        }

        /** Weekly automatic backup: same as saveBackup, then keep only the newest four automatic files. */
        @JavascriptInterface
        public void autoBackup(String name, String json) {
            try {
                String safe = name == null ? "class-planner-auto.json" : name.replaceAll("[^A-Za-z0-9._-]", "_");
                writeDownload(safe, "application/json", json.getBytes(StandardCharsets.UTF_8));
                toast("Weekly backup saved in your Downloads folder: " + safe);
                try (Cursor c = getContentResolver().query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        new String[]{MediaStore.Downloads._ID}, MediaStore.Downloads.DISPLAY_NAME + " LIKE ?",
                        new String[]{"class-planner-auto-%"}, MediaStore.Downloads.DATE_ADDED + " DESC, " + MediaStore.Downloads._ID + " DESC")) {
                    int i = 0;
                    while (c != null && c.moveToNext()) {
                        if (++i > 4) getContentResolver().delete(ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(0)), null, null);
                    }
                }
            } catch (Exception e) {
                toast("Could not save the weekly backup.");
            }
        }

        @JavascriptInterface
        public void setTextZoom(final int percent) {
            runOnUiThread(() -> web.getSettings().setTextZoom(Math.max(50, Math.min(200, percent))));
        }

        @JavascriptInterface
        public void sync(String json) {
            try { Scheduler.apply(getApplicationContext(), json); } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public String takePending() {
            return Scheduler.takePending(getApplicationContext());
        }

        @JavascriptInterface
        public void requestNotifications() {
            runOnUiThread(() -> {
                Scheduler.ensureChannels(getApplicationContext());
                if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7);
                }
            });
        }

        @JavascriptInterface
        public void testNotification() {
            Context c = getApplicationContext();
            if (!c.getSystemService(android.app.NotificationManager.class).areNotificationsEnabled()) {
                toast("Notifications are off. Allow them for Class Planner in your phone's settings.");
                requestNotifications();
                return;
            }
            Scheduler.notifyNow(c, "c", "TEST", "Did you attend this class?", "This is a test. The buttons below work like the real ones.");
        }

        /** Saves a generated file (report) into Downloads and optionally opens the share sheet. */
        @JavascriptInterface
        public void saveFile(String name, String mime, String base64, boolean share) {
            try {
                String safe = name == null ? "file" : name.replaceAll("[^A-Za-z0-9._-]", "_");
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                Uri uri = writeDownload(safe, mime, data);
                if (share) {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    Intent chooser = Intent.createChooser(send, "Share report");
                    runOnUiThread(() -> startActivity(chooser));
                } else {
                    toast("Saved in your Downloads folder: " + safe);
                }
            } catch (Exception e) {
                toast("Could not save the file.");
            }
        }

        /* ---- Google Drive backup and sync (files chosen in the system file screen) ---- */
        @JavascriptInterface
        public void pickTarget(final String kind, final String mode, final String name, final String mime) {
            runOnUiThread(() -> {
                try {
                    boolean open = "open".equals(mode);
                    Intent i = new Intent(open ? Intent.ACTION_OPEN_DOCUMENT : Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(open ? "*/*" : (mime == null ? "application/octet-stream" : mime));
                    if (!open) i.putExtra(Intent.EXTRA_TITLE, name == null ? "ClassPlanner" : name);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    startActivityForResult(i, "backup".equals(kind) ? REQ_BACKUP : REQ_SYNC);
                } catch (Exception e) {
                    toast("Could not open the file screen.");
                }
            });
        }

        @JavascriptInterface
        public String targetInfo(String kind) { return CloudStore.info(getApplicationContext(), kind); }

        @JavascriptInterface
        public void clearTarget(String kind) { CloudStore.clearTarget(getApplicationContext(), kind); if ("backup".equals(kind)) BackupAlarm.cancel(getApplicationContext()); }

        @JavascriptInterface
        public void readTarget(final String kind, final String cb) {
            new Thread(() -> {
                String r;
                try { r = Base64.encodeToString(CloudStore.read(getApplicationContext(), kind), Base64.NO_WRAP); }
                catch (Exception e) { r = "ERR:" + CloudStore.explain(e); }
                jsCb(cb, r);
            }).start();
        }

        @JavascriptInterface
        public void writeTarget(final String kind, final String b64, final String cb) {
            new Thread(() -> {
                String r;
                try { CloudStore.write(getApplicationContext(), kind, Base64.decode(b64, Base64.DEFAULT)); r = "ok"; }
                catch (Exception e) { r = "ERR:" + CloudStore.explain(e); }
                jsCb(cb, r);
            }).start();
        }

        @JavascriptInterface
        public void stageBackup(String b64) {
            try { CloudStore.stage(getApplicationContext(), Base64.decode(b64, Base64.DEFAULT)); } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void backupNow(final String cb) {
            new Thread(() -> jsCb(cb, CloudStore.backupNow(getApplicationContext()))).start();
        }

        @JavascriptInterface
        public String backupStatus() { return CloudStore.status(getApplicationContext()); }

        @JavascriptInterface
        public void scheduleBackup(boolean on) { BackupAlarm.setEnabled(getApplicationContext(), on); }

        /** Shares plain text (a day's classes) through the usual share sheet: WhatsApp, Messages... */
        @JavascriptInterface
        public void shareText(final String text) {
            runOnUiThread(() -> {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(send, "Share schedule"));
                } catch (Exception e) {
                    toast("Could not open the share sheet.");
                }
            });
        }

        private void toast(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
        }
    }
}
