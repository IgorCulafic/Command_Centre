# Build the web UI and publish it to the backend's static dir.
#
# This is the "update everything" step. The PWA and the native apps (Tauri /
# Capacitor) load the UI from the server, so once you run this, every client
# picks up the new version on its next launch — no reinstall, no new APK.
# (Reinstall the native app only when its *shell* changes — see NATIVE_BUILD.md.)
#
# Usage:  powershell -File scripts\deploy-frontend.ps1
#         (it's a local script + uses npm.cmd, so no -ExecutionPolicy bypass needed
#          under the default RemoteSigned policy)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location "$root\frontend"

Write-Host "Building web UI (relative /api, same-origin)..."
npm.cmd run build        # npm.cmd (not npm.ps1, blocked by execution policy); default mode -> relative /api

$static = Join-Path $root "backend\app\static"
New-Item -ItemType Directory -Force -Path $static | Out-Null
Get-ChildItem $static -Force | Remove-Item -Recurse -Force
Copy-Item -Recurse -Force "dist\*" $static

Write-Host "Deployed -> $static"
Write-Host "All clients update on next launch (a backend restart is not normally needed)."
