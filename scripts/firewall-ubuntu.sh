#!/usr/bin/env bash
set -euo pipefail

PANEL_PORT="${PANEL_PORT:-8080}"
GAME_PORT="${GAME_PORT:-8211}"
REST_PORT="${REST_PORT:-8212}"
RCON_PORT="${RCON_PORT:-25575}"

if ! command -v ufw >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ufw
fi

ufw allow "${PANEL_PORT}/tcp"
ufw allow "${GAME_PORT}/udp"
ufw allow "${REST_PORT}/tcp"
ufw allow "${RCON_PORT}/tcp"
ufw --force enable
ufw status verbose
