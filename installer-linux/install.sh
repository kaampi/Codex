#!/usr/bin/env bash
# kaampi Codex (Core service) — Linux installer
#
# Linux equivalent of installer/storycore-installer.iss (the Windows Inno
# Setup installer): downloads the latest storycore-service build fresh at
# install time, same "online installer" convention, and sets it up to run
# quietly in the background — a systemd --user service, no sudo/root, no
# command prompt left open, no CORE_DB_PATH to configure (the binary
# already defaults its database to ~/.storycore/core.db on its own — see
# packages/service/server.mjs's defaultDbPath()).
#
# Pairing with kaampi Write, kaampi Comic and kaampi Explore happens
# separately, from inside each app, once this service is running — see
# each app's own "Connect" flow. This installer only gets Core itself
# running.
#
# Requires systemd (specifically `systemctl --user`) for the autostart-at-
# login mechanism — true by default on current Ubuntu, Fedora, Debian,
# Arch, Pop!_OS, Mint, and openSUSE. If that's not available, this installer
# refuses rather than silently leaving Core unable to start itself; run the
# downloaded binary by hand instead (see README).

set -euo pipefail

APP_NAME="kaampi Codex"
INSTALL_DIR="$HOME/.local/share/StoryCore"
BIN_DIR="$INSTALL_DIR/bin"
BIN_PATH="$BIN_DIR/storycore-service"
DOWNLOAD_URL="https://github.com/kaampi/Codex/releases/latest/download/storycore-service"
SERVICE_NAME="storycore.service"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
SERVICE_PATH="$SYSTEMD_USER_DIR/$SERVICE_NAME"

if ! command -v systemctl > /dev/null 2>&1 || ! systemctl --user status > /dev/null 2>&1; then
  echo "error: $APP_NAME needs a systemd user session (systemctl --user) to run itself" >&2
  echo "       quietly in the background at login. That isn't available here." >&2
  echo "       You can still run the service by hand: download $DOWNLOAD_URL," >&2
  echo "       make it executable, and run it directly." >&2
  exit 1
fi

if ! command -v curl > /dev/null 2>&1; then
  echo "error: curl is required to download $APP_NAME. Install it and run this script again." >&2
  exit 1
fi

echo "Installing $APP_NAME to $INSTALL_DIR ..."
mkdir -p "$BIN_DIR"
curl -fL --progress-bar -o "$BIN_PATH.download" "$DOWNLOAD_URL"
mv "$BIN_PATH.download" "$BIN_PATH"
chmod +x "$BIN_PATH"

mkdir -p "$SYSTEMD_USER_DIR"
cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=$APP_NAME — local sync service for the kaampi Write family of apps

[Service]
ExecStart=$BIN_PATH
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

# Written locally rather than only living in this repo's installer-linux/
# directory, so uninstalling later needs nothing but this one path — same
# self-contained expectation as the Windows installer's own uninstaller.
cat > "$INSTALL_DIR/uninstall.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
systemctl --user disable --now "$SERVICE_NAME" 2>/dev/null || true
rm -f "$SERVICE_PATH"
systemctl --user daemon-reload
rm -rf "$INSTALL_DIR"
echo "$APP_NAME has been removed."
EOF
chmod +x "$INSTALL_DIR/uninstall.sh"

echo
echo "$APP_NAME is installed and running — it starts automatically when you log in."
echo "It never sends anything anywhere by itself; it only listens for the apps"
echo "already on this computer. Pair it from inside each app's own \"Connect\" screen."
echo
echo "Logs:   journalctl --user -u $SERVICE_NAME -f"
echo "Stop:   systemctl --user stop $SERVICE_NAME"
echo "Remove: $INSTALL_DIR/uninstall.sh"
