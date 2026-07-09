# Native apps — Windows (Tauri) & Android (Capacitor)

Both native apps wrap the **same React UI**, and both **load that UI from the
server** (the HTTPS Tailscale URL), not from a bundled copy:

- Tauri: `frontend/src-tauri/tauri.conf.json` → window `"url"`
- Capacitor: `frontend/capacitor.config.ts` → `server.url`

**Why remote-loading:** UI updates need **no reinstall**. Publish a new UI with
`scripts/deploy-frontend.ps1` (build → `backend/app/static`) and every client —
the PWA and both native apps — picks it up on next launch. You only rebuild +
reinstall the native app when its **shell** changes (Tauri/Rust or Capacitor/
Android config) — your "major revisions". See **Updating** at the bottom.

Because the UI is loaded over the network, the apps need connectivity at launch —
which they already do (they're thin clients of one backend; the data lives only in
the NAS SQLite DB, backups = the NAS snapshot, unchanged). The old per-mode
`.env.tauri` / `.env.capacitor` (`VITE_API_BASE`) builds are now unused for
serving — the server build uses relative `/api` (same origin).

---

## Windows desktop (.exe / .msi) — Tauri

**One-time toolchain (≈ a few GB):**
```powershell
winget install Rustlang.Rustup           # then: rustup default stable-msvc
winget install Microsoft.VisualStudio.2022.BuildTools `
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
# WebView2 is already installed on this machine.
```

**Build:**
```powershell
cd D:\AI\Me_Command_Center\frontend
npm run tauri build
```
Output installer: `frontend/src-tauri/target/release/bundle/` (`.msi` and `.exe`/NSIS).
Live dev: `npm run tauri dev`.

Config lives in `frontend/src-tauri/tauri.conf.json` (identifier
`com.igorculafic.commandcenter`, 1200×820 window). The window `"url"` points at the
HTTPS Tailscale URL, so the exe loads the live UI. Rebuild the exe only when the
Tauri/Rust shell or that URL changes.

---

## Android (.apk) — Capacitor

**One-time toolchain (≈ a few GB):**
```powershell
winget install Microsoft.OpenJDK.21    # Capacitor 8 requires JDK 21 (not 17)
# Android SDK command-line tools: install Android Studio, OR the standalone
# cmdline-tools (unzip into %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest), then:
#   sdkmanager --licenses
#   sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
# Set ANDROID_HOME to the SDK path (e.g. %LOCALAPPDATA%\Android\Sdk), and add a
# frontend/android/local.properties with: sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
```

> **Build from PowerShell, not git-bash.** The Android Gradle Plugin needs native
> Windows paths; unix-style `JAVA_HOME=/c/...` / `ANDROID_HOME=/c/...` produce
> `java.io.IOException: The filename, directory name, or volume label syntax is
> incorrect`. Set `$env:JAVA_HOME` to the JDK 21 path and use forward slashes in
> `local.properties`.

**Build the APK:**
```powershell
cd D:\AI\Me_Command_Center\frontend
npm run build -- --mode capacitor
npx cap sync android
cd android
.\gradlew assembleDebug          # debug APK (sideloadable)
```
Output: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

**Install on the phone:** copy the APK over Tailscale (or `adb install app-debug.apk`),
then open it on the phone and allow "install from this source". For a Play-Store /
signed release build, `assembleRelease` with a signing key (separate setup).

Config: `frontend/capacitor.config.ts` (appId `com.igorculafic.commandcenter`;
`server.url` points at the HTTPS Tailscale URL so the app loads the live UI).
Rebuild the APK only when the Capacitor/Android shell or that URL changes.

---

## Updating

**UI / frontend change (the common case) — no reinstall:**
```powershell
powershell -File scripts\deploy-frontend.ps1
```
This builds the web UI and publishes it to `backend/app/static`. The PWA and both
native apps load that on next launch. A backend restart isn't normally needed
(static files are served from disk live).

**Native-shell change (rare = "major revision") — reinstall once:**
- Tauri: `npm run tauri build` → install the new `…/bundle/nsis/*-setup.exe`.
- Capacitor: `npx cap sync android` → `cd android; .\gradlew assembleDebug` →
  sideload the new `app-debug.apk`.

Triggers for a shell rebuild: bumping the app version, changing the server URL,
adding a native plugin/permission, or upgrading Tauri/Capacitor.
