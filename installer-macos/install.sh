#!/usr/bin/env bash
# kaampi Codex (Core service) — macOS installer
#
# macOS equivalent of installer/storycore-installer.iss (Windows) and
# installer-linux/install.sh: no sudo, downloads the latest
# storycore-service-macos build fresh at install time, and sets it up to
# run quietly in the background via a per-user launchd LaunchAgent - the
# closest macOS equivalent of the Windows Startup shortcut / Linux
# systemd --user service.
#
# Pairing with kaampi Write, kaampi Comic and kaampi Explore happens
# separately, from inside each app, once this service is running — see
# each app's own "Connect" flow. This installer only gets Core itself
# running.
#
# Gatekeeper note: a binary downloaded with curl (as this script does)
# never gets the com.apple.quarantine attribute that macOS's Gatekeeper
# acts on - that attribute is only set by apps that call the Quarantine
# API themselves (browsers, Mail, etc.), not by curl. A binary fetched
# straight from a browser link instead of this script WOULD be quarantined
# and refuse to launch without a right-click-Open or `xattr -d
# com.apple.quarantine` first - this script strips it defensively anyway,
# in case that ever changes or someone re-runs it against an
# already-downloaded file.

set -euo pipefail

APP_NAME="kaampi Codex"
INSTALL_DIR="$HOME/Library/Application Support/StoryCore"
BIN_DIR="$INSTALL_DIR/bin"
BIN_PATH="$BIN_DIR/storycore-service"
DOWNLOAD_URL="https://github.com/kaampi/Codex/releases/latest/download/storycore-service-macos"
LABEL="se.ocedo.storycore"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
LOG_DIR="$INSTALL_DIR/logs"

if ! command -v curl > /dev/null 2>&1; then
  echo "error: curl is required to download $APP_NAME. It ships with macOS by default - if it's missing, something unusual is going on." >&2
  exit 1
fi

echo "Installing $APP_NAME to $INSTALL_DIR ..."
mkdir -p "$BIN_DIR" "$LOG_DIR"
curl -fL --progress-bar -o "$BIN_PATH.download" "$DOWNLOAD_URL"
mv "$BIN_PATH.download" "$BIN_PATH"
chmod +x "$BIN_PATH"
xattr -d com.apple.quarantine "$BIN_PATH" 2>/dev/null || true

mkdir -p "$LAUNCH_AGENTS_DIR"
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN_PATH</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/stderr.log</string>
</dict>
</plist>
EOF

# launchctl load/unload are deprecated (still work, but Apple's own
# guidance since 10.11 is bootstrap/bootout) - unload any previous
# version of this agent first so re-running this installer to upgrade
# doesn't leave two launchd entries pointing at an old plist.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/$LABEL"

# Written locally rather than only living in this repo's installer-macos/
# directory, so uninstalling later needs nothing but this one path - same
# self-contained expectation as the Windows/Linux installers.
cat > "$INSTALL_DIR/uninstall.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
launchctl bootout "gui/\$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST_PATH"
rm -rf "$INSTALL_DIR"
echo "$APP_NAME has been removed."
EOF
chmod +x "$INSTALL_DIR/uninstall.sh"

echo
echo "$APP_NAME is installed and running — it starts automatically when you log in."
echo "It never sends anything anywhere by itself; it only listens for the apps"
echo "already on this computer. Pair it from inside each app's own \"Connect\" screen."
echo
echo "Logs:   $LOG_DIR/stdout.log (and stderr.log)"
echo "Stop:   launchctl bootout \"gui/\$(id -u)/$LABEL\""
echo "Remove: \"$INSTALL_DIR/uninstall.sh\""
