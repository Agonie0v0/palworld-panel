#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-palworld}"
APP_ROOT="${APP_ROOT:-/opt/palworld}"
SERVER_DIR="${SERVER_DIR:-$APP_ROOT/server}"
STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
DEPOT_DOWNLOADER_DIR="${DEPOT_DOWNLOADER_DIR:-/opt/depotdownloader}"
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
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

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
COMMON_PACKAGES=(
  ca-certificates
  curl
  gnupg
  jq
  sudo
  tar
  unzip
  software-properties-common
)

if [[ "$USE_BOX64" == "1" ]]; then
  apt-get install -y "${COMMON_PACKAGES[@]}"
else
  apt-get install -y "${COMMON_PACKAGES[@]}" lib32gcc-s1 lib32stdc++6
fi

if [[ "$USE_BOX64" == "1" ]] && ! command -v box64 >/dev/null 2>&1; then
  echo "[2/7] Installing box64 for ARM64"
  curl -fsSL https://ryanfortner.github.io/box64-debs/KEY.gpg | gpg --dearmor -o /usr/share/keyrings/box64-debs-archive-keyring.gpg
  echo "deb [arch=arm64 signed-by=/usr/share/keyrings/box64-debs-archive-keyring.gpg] https://ryanfortner.github.io/box64-debs/debian ./" >/etc/apt/sources.list.d/box64.list
  apt-get update
  apt-get install -y box64
else
  echo "[2/7] box64 step skipped"
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_ROOT" "$SERVER_DIR" "$STEAMCMD_DIR" "$DEPOT_DOWNLOADER_DIR" "$BACKUP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT" "$STEAMCMD_DIR" "$DEPOT_DOWNLOADER_DIR"

if [[ "$USE_BOX64" == "1" ]]; then
  echo "[3/7] Installing DepotDownloader for ARM64"
  DEPOT_DOWNLOADER_DIR="$DEPOT_DOWNLOADER_DIR" APP_USER="$APP_USER" bash "$SCRIPT_DIR/install-depot-downloader.sh"
else
  echo "[3/7] Installing current SteamCMD runtime"
  STEAMCMD_DIR="$STEAMCMD_DIR" APP_USER="$APP_USER" bash "$SCRIPT_DIR/install-steamcmd.sh"
fi

echo "[4/7] Installing or updating Palworld dedicated server"
if [[ "$USE_BOX64" == "1" ]]; then
  sudo -u "$APP_USER" env HOME="$(getent passwd "$APP_USER" | cut -d: -f6)" \
    "$DEPOT_DOWNLOADER_DIR/DepotDownloader" \
    -app 2394010 \
    -dir "$SERVER_DIR" \
    -validate
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

APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
if [[ -f "$SERVER_DIR/linux64/steamclient.so" ]]; then
  mkdir -p "$APP_HOME/.steam/sdk64"
  ln -sfn "$SERVER_DIR/linux64/steamclient.so" "$APP_HOME/.steam/sdk64/steamclient.so"
  chown -R "$APP_USER:$APP_USER" "$APP_HOME/.steam"
fi

echo "[6/7] Installing systemd service"
if [[ "$USE_BOX64" == "1" ]]; then
  BOX64_BIN="$(command -v box64)"
  PAL_BINARY="$SERVER_DIR/Pal/Binaries/Linux/PalServer-Linux-Shipping"
  if [[ ! -f "$PAL_BINARY" ]]; then
    PAL_BINARY="$SERVER_DIR/Pal/Binaries/Linux/PalServer-Linux-Test"
  fi
  if [[ ! -f "$PAL_BINARY" ]]; then
    echo "Palworld server binary was not found."
    exit 1
  fi
  chmod +x "$PAL_BINARY"
  EXEC_START="$BOX64_BIN $PAL_BINARY Pal -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS"
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
