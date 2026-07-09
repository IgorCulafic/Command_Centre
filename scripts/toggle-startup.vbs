' ===================================================================
'  Toggle "start Command Center backend with Windows".
'  Double-click to flip it: adds or removes the Startup-folder shortcut
'  that launches the backend (windowless) at login. Shows a popup with
'  the new state. Pass "quiet" to skip the popup (used for testing).
' ===================================================================
Option Explicit
Dim sh, fso, startup, lnk, vbs, quiet, nowOn, msg, i, s
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

quiet = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "quiet" Then quiet = True
Next

startup = sh.SpecialFolders("Startup")
lnk = startup & "\Command Center Backend.lnk"
vbs = "D:\AI\Me_Command_Center\scripts\start-command-center.vbs"

If fso.FileExists(lnk) Then
  fso.DeleteFile lnk
  nowOn = False
Else
  Set s = sh.CreateShortcut(lnk)
  s.TargetPath = "wscript.exe"
  s.Arguments = """" & vbs & """ backend"
  s.WorkingDirectory = "D:\AI\Me_Command_Center\scripts"
  s.IconLocation = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Command Center\app.exe, 0"
  s.Description = "Start Command Center backend at login"
  s.Save
  nowOn = True
End If

If nowOn Then
  msg = "Start Command Center with Windows is now ON."
Else
  msg = "Start Command Center with Windows is now OFF."
End If
WScript.Echo msg
If Not quiet Then MsgBox msg, 64, "Command Center"
