# Class Planner (Android)

Offline timetable, academic calendar, own plans and attendance tracker. Everything is stored only on the phone.

- `web-src/` holds the app (one HTML template + parser). `python3 web-src/build.py apk` writes `app/src/main/assets/index.html`.
- Every push to `main` builds a signed APK (GitHub Actions) and publishes it on the **Releases** page as `ClassPlanner.apk`.
- The signing key (`app/planner.keystore`) is committed on purpose so new builds install over old ones and keep your data. Keep this repo private.

## Drive backup and sync (how it works without internet access)

The app has no INTERNET permission. Google Drive is reached through Android's file screen: you pick a Google account and a file once, Android keeps the permission, and the Drive app does the upload when Class Planner writes to that file.

- **No passphrase.** The files are ordinary readable JSON, so anyone who can open that Drive account (or a shared link) can read them. Backups made by the earlier build with a passphrase can still be restored (the app asks for that old passphrase); `web-src/crypto.js` is kept for that.
- **Daily backup.** The page stages a copy after every change (`CloudStore.stage`). An alarm around 22:00 (`BackupAlarm`) writes it to the Drive file you chose, retrying every two hours up to four times if it fails. One rolling file, `ClassPlanner-backup.json`. Restore with "Restore from a backup file".
- **Sync.** One shared file `ClassPlanner-sync.json`. Each write carries a random revision; a phone pulls when only the file changed, pushes when only it changed, and offers Combine / Keep mine / Use theirs when both changed. A snapshot is kept for "Undo last sync". Reminder settings stay per phone.
- Not covered by automated tests (need a real phone and Drive): the Android file screen, Drive's own provider behaviour, and the background write at night.
