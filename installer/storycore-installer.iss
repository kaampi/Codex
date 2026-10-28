; -- kaampi Codex (Core service) — installer --
;
; Installs the Core service (see ../packages/service, built as a single
; Windows executable - no Node.js required on the target machine) and sets
; it up to run quietly in the background: a Windows Startup shortcut, no
; admin rights needed, no command prompt, no CORE_DB_PATH to configure -
; the executable already defaults its database to
; %LOCALAPPDATA%\StoryCore\core.db on its own. That folder name is a
; stable technical path, unrelated to the app's own display name, kept
; as-is so an existing install's data is never orphaned by a rebrand.
;
; Downloads the executable fresh at install time (Inno Setup 6.3+'s
; built-in [Files] "download" flag) from the latest GitHub Release, the
; same "online installer" convention kaampi Write's own installer stub
; already uses - this script rarely needs to change; only the downloaded
; payload updates. See .github/workflows/service-build-windows.yml for
; how that release is published.
;
; Pairing with kaampi Write, kaampi Comic and kaampi Explore happens
; separately, from inside each app, once this service is running - see
; each app's own "Connect" flow. This installer only gets Core itself
; running.

#define MyAppName "kaampi Codex"
#define MyAppVersion "1.0"
#define ServiceDownloadURL "https://github.com/kaampi/Codex/releases/latest/download/storycore-service.exe"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Ocedo
DefaultDirName={localappdata}\StoryCore
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
PrivilegesRequired=lowest
WizardStyle=modern
OutputBaseFilename=kaampi-Codex-Setup
OutputDir=output
SolidCompression=yes
Compression=lzma

[Messages]
WelcomeLabel2=This sets up kaampi Codex, the local service kaampi Write (and its sibling apps) can optionally connect to for private manuscript backups and controlled sharing between apps.%n%nkaampi Codex runs quietly in the background and starts automatically when you log in. It never sends anything anywhere by itself - it only listens for the apps already on this computer. Pair it from inside each app's own "Connect" screen after this finishes.

[Files]
; Downloaded fresh, not bundled into this installer - ExternalSize is
; approximate, used only for the progress display.
Source: "{#ServiceDownloadURL}"; DestName: "storycore-service.exe"; DestDir: "{app}"; ExternalSize: 70000000; Flags: external download ignoreversion
; Bundled directly (a small local script, not worth downloading).
Source: "run-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; The actual "runs automatically" mechanism Mats chose: an ordinary
; Startup-folder shortcut, no admin rights, no Windows Service, visible
; and closeable in Task Manager like any other background app.
Name: "{userstartup}\kaampi Codex"; Filename: "wscript.exe"; Parameters: """{app}\run-hidden.vbs"""; WorkingDir: "{app}"
Name: "{group}\Uninstall kaampi Codex"; Filename: "{uninstallexe}"

[Run]
; Starts it right away too, not just at the next login.
Filename: "wscript.exe"; Parameters: """{app}\run-hidden.vbs"""; Description: "Start kaampi Codex now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop the running service before its files are removed, otherwise a
; locked storycore-service.exe can make uninstall fail or leave a
; zombie process behind until the next reboot.
Filename: "{cmd}"; Parameters: "/C taskkill /IM storycore-service.exe /F"; Flags: runhidden skipifdoesntexist
