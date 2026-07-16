#!/usr/bin/env bash
set -euo pipefail

STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
APP_USER="${APP_USER:-palworld}"
STEAM_CDN="${STEAM_CDN:-https://steamcdn-a.akamaihd.net/client}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-steamcmd.sh"
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$STEAMCMD_DIR"
curl -fsSL "$STEAM_CDN/steam_cmd_linux" -o "$tmpdir/manifest.vdf"

mapfile -t packages < <(awk -F'"' '/"file"/ { print $4 }' "$tmpdir/manifest.vdf")
if [[ "${#packages[@]}" -eq 0 ]]; then
  echo "SteamCMD manifest did not contain package files."
  exit 1
fi

for package in "${packages[@]}"; do
  echo "Downloading SteamCMD package: $package"
  curl -fsSL "$STEAM_CDN/$package" -o "$tmpdir/$package"
  unzip -oq "$tmpdir/$package" -d "$STEAMCMD_DIR"
done

chmod +x "$STEAMCMD_DIR/steamcmd.sh" "$STEAMCMD_DIR/linux32/steamcmd"
chown -R "$APP_USER:$APP_USER" "$STEAMCMD_DIR"

echo "SteamCMD installed: $STEAMCMD_DIR"
