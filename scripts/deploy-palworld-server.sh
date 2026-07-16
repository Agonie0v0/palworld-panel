#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-palworld}"
APP_ROOT="${APP_ROOT:-/opt/palworld}"
SERVER_DIR="${SERVER_DIR:-$APP_ROOT/server}"
STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups}"
SERVICE_NAME="${SERVICE_NAME:-palworld}"
SERVER_NAME="${SERVER_NAME:-Palworld Server}"
SERVER_DESCRIPTION="${SERVER_DESCRIPTION:-Managed by palworld-panel}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-change-admin-password}"
SERVER_PASSWORD="${SERVER_PASSWORD:-}"
PUBLIC_PORT="${PUBLIC_PORT:-8211}"
RCON_PORT="${RCON_PORT:-25575}"
REST_PORT="${REST_PORT:-8212}"
AUTO_START="${AUTO_START:-0}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root. The panel service should run as root for one-click deployment."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Only Ubuntu/Debian deployment is currently automated."
  exit 1
fi

ARCH="$(uname -m)"
USE_BOX64=0
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
  USE_BOX64=1
fi

echo "[1/7] Installing system packages"
apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  jq \
  tar \
  unzip \
  lib32gcc-s1 \
  lib32stdc++6 \
  software-properties-common

if [[ "$USE_BOX64" == "1" && ! -x /usr/bin/box64 ]]; then
  echo "[2/7] Installing box64 for ARM64"
  curl -fsSL https://ryanfortner.github.io/box64-debs/KEY.gpg | gpg --dearmor -o /usr/share/keyrings/box64-debs-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/box64-debs-archive-keyring.gpg] https://ryanfortner.github.io/box64-debs/debian ./" >/etc/apt/sources.list.d/box64.list
  apt-get update
  apt-get install -y box64-arm64
else
  echo "[2/7] box64 step skipped"
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_ROOT" "$SERVER_DIR" "$STEAMCMD_DIR" "$BACKUP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT" "$STEAMCMD_DIR"

if [[ ! -x "$STEAMCMD_DIR/steamcmd.sh" ]]; then
  echo "[3/7] Installing SteamCMD"
  tmpdir="$(mktemp -d)"
  curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" -o "$tmpdir/steamcmd.tar.gz"
  tar -xzf "$tmpdir/steamcmd.tar.gz" -C "$STEAMCMD_DIR"
  rm -rf "$tmpdir"
  chown -R "$APP_USER:$APP_USER" "$STEAMCMD_DIR"
else
  echo "[3/7] SteamCMD already installed"
fi

echo "[4/7] Installing or updating Palworld dedicated server"
if [[ "$USE_BOX64" == "1" ]]; then
  sudo -u "$APP_USER" box64 "$STEAMCMD_DIR/steamcmd.sh" \
    +force_install_dir "$SERVER_DIR" \
    +login anonymous \
    +app_update 2394010 validate \
    +quit
else
  sudo -u "$APP_USER" "$STEAMCMD_DIR/steamcmd.sh" \
    +force_install_dir "$SERVER_DIR" \
    +login anonymous \
    +app_update 2394010 validate \
    +quit
fi

echo "[5/7] Writing Palworld settings"
SETTINGS_DIR="$SERVER_DIR/Pal/Saved/Config/LinuxServer"
mkdir -p "$SETTINGS_DIR"
cat >"$SETTINGS_DIR/PalWorldSettings.ini" <<EOF
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(ServerName="$SERVER_NAME",ServerDescription="$SERVER_DESCRIPTION",AdminPassword="$ADMIN_PASSWORD",ServerPassword="$SERVER_PASSWORD",PublicPort=$PUBLIC_PORT,RCONEnabled=True,RCONPort=$RCON_PORT,RESTAPIEnabled=True,RESTAPIPort=$REST_PORT,Difficulty="None",DayTimeSpeedRate=1,NightTimeSpeedRate=1,ExpRate=1,PalCaptureRate=1,DeathPenalty="All")
EOF
chown -R "$APP_USER:$APP_USER" "$SERVER_DIR/Pal"

echo "[6/7] Installing systemd service"
if [[ "$USE_BOX64" == "1" ]]; then
  EXEC_START="/usr/bin/box64 $SERVER_DIR/PalServer.sh -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS"
else
  EXEC_START="$SERVER_DIR/PalServer.sh -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS"
fi

cat >"/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Palworld Dedicated Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SERVER_DIR
ExecStart=$EXEC_START
Restart=always
RestartSec=10
LimitNOFILE=100000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo "[7/7] Finalizing"
if [[ "$AUTO_START" == "1" ]]; then
  systemctl restart "$SERVICE_NAME"
fi

echo "Palworld server deployed."
echo "Architecture: $ARCH"
echo "Install dir: $SERVER_DIR"
echo "Service: $SERVICE_NAME"
echo "Player port UDP: $PUBLIC_PORT"
echo "RCON TCP: $RCON_PORT"
echo "REST API TCP: $REST_PORT"
