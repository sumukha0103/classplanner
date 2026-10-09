# Class Planner (Android)

Offline timetable, academic calendar, own plans and attendance tracker. Everything is stored only on the phone.

- `web-src/` holds the app (one HTML template + parser). `python3 web-src/build.py apk` writes `app/src/main/assets/index.html`.
- Every push to `main` builds a signed APK (GitHub Actions) and publishes it on the **Releases** page as `ClassPlanner.apk`.
- The signing key (`app/planner.keystore`) is committed on purpose so new builds install over old ones and keep your data. Keep this repo private.
