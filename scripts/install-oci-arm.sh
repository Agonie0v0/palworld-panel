#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-palworld}"
APP_ROOT="${APP_ROOT:-/opt/palworld}"
SERVER_DIR="${SERVER_DIR:-$APP_ROOT/server}"
STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
PANEL_DIR="${PANEL_DIR:-/opt/palworld-panel}"
PANEL_PORT="${PANEL_PORT:-8080}"
PANEL_TOKEN="${PANEL_TOKEN:-$(openssl rand -hex 24)}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-oci-arm.sh"
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  echo "This installer is tuned for Oracle Cloud ARM64. Current arch: $ARCH"
fi

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

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_ROOT" "$SERVER_DIR" "$STEAMCMD_DIR" "$APP_ROOT/backups"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT"
chown -R "$APP_USER:$APP_USER" "$STEAMCMD_DIR"

if ! command -v box64 >/dev/null 2>&1; then
  curl -fsSL https://ryanfortner.github.io/box64-debs/KEY.gpg | gpg --dearmor -o /usr/share/keyrings/box64-debs-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/box64-debs-archive-keyring.gpg] https://ryanfortner.github.io/box64-debs/debian ./" >/etc/apt/sources.list.d/box64.list
  apt-get update
  apt-get install -y box64-arm64
fi

if [[ ! -x "$STEAMCMD_DIR/steamcmd.sh" ]]; then
  tmpdir="$(mktemp -d)"
  curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" -o "$tmpdir/steamcmd.tar.gz"
  tar -xzf "$tmpdir/steamcmd.tar.gz" -C "$STEAMCMD_DIR"
  rm -rf "$tmpdir"
  chown -R "$APP_USER:$APP_USER" "$STEAMCMD_DIR"
fi

sudo -u "$APP_USER" box64 "$STEAMCMD_DIR/steamcmd.sh" \
  +force_install_dir "$SERVER_DIR" \
  +login anonymous \
  +app_update 2394010 validate \
  +quit

SETTINGS_DIR="$SERVER_DIR/Pal/Saved/Config/LinuxServer"
mkdir -p "$SETTINGS_DIR"
cat >"$SETTINGS_DIR/PalWorldSettings.ini" <<EOF
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(ServerName="Palworld 1.0 Oracle ARM",ServerDescription="Managed by palworld-panel",AdminPassword="change-admin-password",ServerPassword="",PublicPort=8211,RCONEnabled=True,RCONPort=25575,RESTAPIEnabled=True,RESTAPIPort=8212,Difficulty="None",DayTimeSpeedRate=1,NightTimeSpeedRate=1,ExpRate=1,PalCaptureRate=1,DeathPenalty="All")
EOF
chown -R "$APP_USER:$APP_USER" "$SERVER_DIR/Pal"

cat >/etc/systemd/system/palworld.service <<EOF
[Unit]
Description=Palworld Dedicated Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SERVER_DIR
ExecStart=/usr/bin/box64 $SERVER_DIR/PalServer.sh -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS
Restart=always
RestartSec=10
LimitNOFILE=100000

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "$PANEL_DIR"
cp -R package.json src public config.example.json "$PANEL_DIR/"
mkdir -p "$PANEL_DIR/data"

cat >"$PANEL_DIR/data/config.json" <<EOF
{
  "panel": {
    "host": "0.0.0.0",
    "port": $PANEL_PORT,
    "token": "$PANEL_TOKEN"
  },
  "server": {
    "mode": "systemd",
    "serviceName": "palworld",
    "installDir": "$SERVER_DIR",
    "settingsPath": "$SERVER_DIR/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
    "saveDir": "$SERVER_DIR/Pal/Saved",
    "backupDir": "$APP_ROOT/backups",
    "steamcmdPath": "$STEAMCMD_DIR/steamcmd.sh",
    "containerName": "",
    "imageName": "",
    "composeProjectDir": "",
    "rconHost": "127.0.0.1",
    "rconPort": 25575,
    "restHost": "127.0.0.1",
    "restPort": 8212,
    "restUser": "admin",
    "restPassword": "",
    "publicPort": 8211,
    "saveParserCommand": ""
  },
  "automation": {
    "backupIntervalMinutes": 0,
    "broadcastIntervalMinutes": 0,
    "broadcastMessage": "",
    "keepBackups": 20
  },
  "settings": {
    "ServerName": "Palworld 1.0 Oracle ARM",
    "ServerDescription": "Managed by palworld-oneclick-panel",
    "AdminPassword": "change-admin-password",
    "ServerPassword": "",
    "PublicPort": 8211,
    "RCONEnabled": true,
    "RCONPort": 25575,
    "RESTAPIEnabled": true,
    "RESTAPIPort": 8212,
    "Difficulty": "None",
    "DayTimeSpeedRate": 1,
    "NightTimeSpeedRate": 1,
    "ExpRate": 1,
    "PalCaptureRate": 1,
    "DeathPenalty": "All"
  }
}
EOF

chown -R "$APP_USER:$APP_USER" "$PANEL_DIR"

cat >/etc/systemd/system/palworld-panel.service <<EOF
[Unit]
Description=Palworld Web Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$PANEL_DIR
Environment=NODE_ENV=production
Environment=PANEL_TOKEN=$PANEL_TOKEN
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable palworld-panel
systemctl enable palworld
systemctl restart palworld-panel

cat <<EOF

Installed.
Panel URL: http://SERVER_PUBLIC_IP:$PANEL_PORT
Panel token: $PANEL_TOKEN
Default admin password: change-admin-password

Open Oracle security list / NSG and local firewall ports:
- TCP $PANEL_PORT for this panel
- UDP 8211 for Palworld players
- TCP 8212 only if you expose REST API
- TCP 25575 only if you expose RCON

Start game server:
  Open the panel, then click Start.

Or start from shell:
  sudo systemctl start palworld

Change AdminPassword in the panel before inviting players.

EOF
