#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="${AGENT_DIR:-/opt/palworld-agent}"
AGENT_PORT="${AGENT_PORT:-8081}"
AGENT_TOKEN="${AGENT_TOKEN:-$(openssl rand -hex 24)}"
INSTALL_SAVE_PARSER="${INSTALL_SAVE_PARSER:-1}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-agent.sh"
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Only Ubuntu/Debian Agent installation is currently automated."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git openssl tar

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$AGENT_DIR/data"
cp -R package.json src public config.example.json parsers scripts "$AGENT_DIR/"
chmod +x "$AGENT_DIR/scripts/"*.sh "$AGENT_DIR/parsers/sav_cli/run-save-parser"

if [[ ! -f "$AGENT_DIR/data/config.json" ]]; then
  cp "$AGENT_DIR/config.example.json" "$AGENT_DIR/data/config.json"
else
  echo "Existing Agent config kept: $AGENT_DIR/data/config.json"
fi

if [[ "$INSTALL_SAVE_PARSER" == "1" ]]; then
  PARSER_DIR="$AGENT_DIR/parsers/sav_cli" bash "$AGENT_DIR/scripts/install-sav-parser.sh"
fi

cat >/etc/systemd/system/palworld-agent.service <<EOF
[Unit]
Description=Palworld Panel Remote Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_DIR
Environment=NODE_ENV=production
Environment=AGENT_MODE=1
Environment=AGENT_PORT=$AGENT_PORT
Environment=PAL_AGENT_TOKEN=$AGENT_TOKEN
Environment=SAVE_PARSER_COMMAND=$AGENT_DIR/parsers/sav_cli/run-save-parser
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable palworld-agent
systemctl restart palworld-agent

cat <<EOF

Agent installed.
Agent address: http://SERVER_PUBLIC_IP:$AGENT_PORT
Agent token: $AGENT_TOKEN

In the Web panel open:
Automation -> Agent separated deployment -> Remote Agent

Only allow the panel machine to access TCP $AGENT_PORT.

EOF
