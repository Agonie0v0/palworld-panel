#!/usr/bin/env bash
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/palworld-panel}"
PANEL_PORT="${PANEL_PORT:-19090}"
PANEL_TOKEN="${PANEL_TOKEN:-$(openssl rand -hex 24)}"
INSTALL_SAVE_PARSER="${INSTALL_SAVE_PARSER:-1}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-panel.sh"
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Only Ubuntu/Debian panel installation is currently automated."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git tar

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$PANEL_DIR/data"
cp -R package.json src public config.example.json parsers scripts "$PANEL_DIR/"
chmod +x "$PANEL_DIR/scripts/"*.sh "$PANEL_DIR/parsers/sav_cli/run-save-parser"

if [[ ! -f "$PANEL_DIR/data/config.json" ]]; then
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
    "installDir": "/opt/palworld/server",
    "settingsPath": "/opt/palworld/server/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
    "saveDir": "/opt/palworld/server/Pal/Saved",
    "backupDir": "/opt/palworld/backups",
    "steamcmdPath": "/opt/steamcmd/steamcmd.sh",
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
    "saveParserCommand": "$PANEL_DIR/parsers/sav_cli/run-save-parser"
  },
  "automation": {
    "backupIntervalMinutes": 0,
    "broadcastIntervalMinutes": 0,
    "broadcastMessage": "",
    "keepBackups": 20
  },
  "settings": {
    "ServerName": "Palworld Server",
    "ServerDescription": "Managed by palworld-panel",
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
else
  echo "Existing panel config kept: $PANEL_DIR/data/config.json"
fi

if [[ "$INSTALL_SAVE_PARSER" == "1" ]]; then
  PARSER_DIR="$PANEL_DIR/parsers/sav_cli" bash "$PANEL_DIR/scripts/install-sav-parser.sh"
fi

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
Environment=SAVE_PARSER_COMMAND=$PANEL_DIR/parsers/sav_cli/run-save-parser
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable palworld-panel
systemctl restart palworld-panel

cat <<EOF

Panel installed.
Panel URL: http://SERVER_PUBLIC_IP:$PANEL_PORT
Panel token: $PANEL_TOKEN

Next:
1. Open the panel.
2. Go to Deploy.
3. Click Detect.
4. Click Deploy Palworld Server.

Open firewall/security-list ports:
- TCP $PANEL_PORT for the panel
- UDP 8211 for Palworld players after server deployment

EOF
