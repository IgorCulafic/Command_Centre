' ===================================================================
'  Command Center launcher (windowless)
'   - Starts the backend (uvicorn) if it isn't already running.
'     Output is logged to %TEMP%\command-center-backend.log so the
'     process always has valid stdio (pythonw has none, which crashes
'     uvicorn — that's why we use python.exe + redirection here).
'   - Unless run with the "backend" argument, opens the desktop app.
'  Run:  double-click, or  wscript start-command-center.vbs [backend]
' ===================================================================
Option Explicit
Dim sh, fso, backend, py, log, app, mode, tmp, isUp
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

backend = "D:\AI\Me_Command_Center\backend"
py  = backend & "\.venv\Scripts\python.exe"
log = sh.ExpandEnvironmentStrings("%TEMP%") & "\command-center-backend.log"
tmp = sh.ExpandEnvironmentStrings("%TEMP%") & "\cc-portcheck.txt"
app = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Command Center\app.exe"

mode = ""
If WScript.Arguments.Count > 0 Then mode = LCase(WScript.Arguments(0))

' Is something already listening on :8000?  (hidden, wait, capture to a temp file)
sh.Run "cmd /c netstat -ano | findstr "":8000"" | findstr LISTENING > " & tmp, 0, True
isUp = False
If fso.FileExists(tmp) Then
  If fso.GetFile(tmp).Size > 0 Then isUp = True
End If

If Not isUp Then
  sh.CurrentDirectory = backend
  sh.Run "cmd /c " & py & " -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > " & log & " 2>&1", 0, False
  WScript.Sleep 2500
End If

' Open the desktop app unless we were told backend-only (PC startup).
If mode <> "backend" Then
  If fso.FileExists(app) Then sh.Run """" & app & """", 1, False
End If
