#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-/opt/palworld}"
SERVER_DIR="${SERVER_DIR:-$APP_ROOT/server}"
PANEL_DIR="${PANEL_DIR:-/opt/palworld-panel}"
PANEL_PORT="${PANEL_PORT:-19090}"
PANEL_TOKEN="${PANEL_TOKEN:-$(openssl rand -hex 24)}"
INSTALL_SAVE_PARSER="${INSTALL_SAVE_PARSER:-1}"
SERVER_NAME="${SERVER_NAME:-Palworld Oracle ARM}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -hex 16)}"
SERVER_PASSWORD="${SERVER_PASSWORD:-}"
AUTO_START="${AUTO_START:-1}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-oci-arm.sh"
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  echo "This installer is intended for Oracle Cloud ARM64. Current arch: $ARCH"
  exit 1
fi

PANEL_DIR="$PANEL_DIR" \
PANEL_PORT="$PANEL_PORT" \
PANEL_TOKEN="$PANEL_TOKEN" \
INSTALL_SAVE_PARSER="$INSTALL_SAVE_PARSER" \
bash "$SCRIPT_DIR/install-panel.sh"

APP_ROOT="$APP_ROOT" \
SERVER_DIR="$SERVER_DIR" \
BACKUP_DIR="$APP_ROOT/backups" \
SERVER_NAME="$SERVER_NAME" \
ADMIN_PASSWORD="$ADMIN_PASSWORD" \
SERVER_PASSWORD="$SERVER_PASSWORD" \
AUTO_START="$AUTO_START" \
bash "$SCRIPT_DIR/deploy-palworld-server.sh"

CONFIG_PATH="$PANEL_DIR/data/config.json"
tmp_config="$(mktemp)"
jq \
  --arg server_dir "$SERVER_DIR" \
  --arg backup_dir "$APP_ROOT/backups" \
  --arg updater "/opt/depotdownloader/DepotDownloader" \
  --arg server_name "$SERVER_NAME" \
  --arg admin_password "$ADMIN_PASSWORD" \
  --arg server_password "$SERVER_PASSWORD" \
  '.server.installDir = $server_dir
    | .server.settingsPath = ($server_dir + "/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini")
    | .server.saveDir = ($server_dir + "/Pal/Saved")
    | .server.backupDir = $backup_dir
    | .server.steamcmdPath = $updater
    | .settings.ServerName = $server_name
    | .settings.AdminPassword = $admin_password
    | .settings.ServerPassword = $server_password' \
  "$CONFIG_PATH" >"$tmp_config"
install -m 600 "$tmp_config" "$CONFIG_PATH"
rm -f "$tmp_config"
systemctl restart palworld-panel

cat <<EOF

Oracle ARM installation completed.
Panel URL: http://SERVER_PUBLIC_IP:$PANEL_PORT
Panel token: $PANEL_TOKEN
Palworld admin password: $ADMIN_PASSWORD
Player port: 8211/UDP

Create the panel administrator account when opening the WebUI for the first time.

EOF
