#!/usr/bin/env bash
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/palworld-panel}"
PANEL_PORT="${PANEL_PORT:-19090}"
PANEL_TOKEN="${PANEL_TOKEN:-$(openssl rand -hex 24)}"
INSTALL_SAVE_PARSER="${INSTALL_SAVE_PARSER:-1}"
SOURCE_COMMIT="${PANEL_BUILD_ID:-$(git rev-parse HEAD 2>/dev/null || true)}"

if [[ "$PANEL_DIR" != /* || "$PANEL_DIR" == "/" ]]; then
  echo "PANEL_DIR must be a non-root absolute path."
  exit 1
fi

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

PANEL_VERSION="$(node -p 'require("./package.json").version')"
PANEL_BUILD_LABEL="${SOURCE_COMMIT:0:8}"
PANEL_BUILD_LABEL="${PANEL_BUILD_LABEL:-unknown}"

mkdir -p "$PANEL_DIR/data" "$PANEL_DIR/upstream-web"
rm -rf \
  "$PANEL_DIR/public" \
  "$PANEL_DIR/resources" \
  "$PANEL_DIR/THIRD_PARTY_LICENSES" \
  "$PANEL_DIR/upstream-web/dist" \
  "$PANEL_DIR/upstream-web/node_modules" \
  "$PANEL_DIR/upstream-web/public" \
  "$PANEL_DIR/upstream-web/src"
rm -f \
  "$PANEL_DIR/upstream-web/index.html" \
  "$PANEL_DIR/upstream-web/jsconfig.json" \
  "$PANEL_DIR/upstream-web/package.json" \
  "$PANEL_DIR/upstream-web/package-lock.json" \
  "$PANEL_DIR/upstream-web/pnpm-lock.yaml" \
  "$PANEL_DIR/upstream-web/pnpm-workspace.yaml" \
  "$PANEL_DIR/upstream-web/README.md" \
  "$PANEL_DIR/upstream-web/vite.config.js"
cp -R package.json package-lock.json NOTICE.md THIRD_PARTY_LICENSES src config.example.json parsers scripts "$PANEL_DIR/"
cp -R upstream-web/dist "$PANEL_DIR/upstream-web/"
cp -R upstream-web/public "$PANEL_DIR/upstream-web/"
printf '{"commit":"%s","installedAt":"%s"}\n' "$SOURCE_COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$PANEL_DIR/data/build.json"
cd "$PANEL_DIR"
npm ci --omit=dev
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
    "restProtocol": "http:",
    "restUser": "admin",
    "restPassword": "",
    "publicPort": 8211,
    "saveParserCommand": "$PANEL_DIR/parsers/sav_cli/run-save-parser"
  },
  "automation": {
    "backupIntervalMinutes": 0,
    "backupIntervalSeconds": 0,
    "broadcastIntervalMinutes": 0,
    "broadcastMessage": "",
    "keepBackups": 20,
    "rconTaskCheckSeconds": 30,
    "backupKeepDays": 7,
    "playerSyncInterval": 60,
    "saveSyncInterval": 120,
    "saveSourceMode": "directory",
    "saveSourcePath": "",
    "playerLogging": false,
    "playerLoginMessage": "",
    "playerLogoutMessage": "",
    "kickNonWhitelist": false,
    "rconUseBase64": false,
    "rconTimeout": 5,
    "restTimeout": 5,
    "webTls": false,
    "webCertPath": "",
    "webKeyPath": "",
    "webPublicUrl": ""
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
Panel version: v$PANEL_VERSION ($PANEL_BUILD_LABEL)
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
