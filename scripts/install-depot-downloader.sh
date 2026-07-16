#!/usr/bin/env bash
set -euo pipefail

DEPOT_DOWNLOADER_DIR="${DEPOT_DOWNLOADER_DIR:-/opt/depotdownloader}"
APP_USER="${APP_USER:-palworld}"
RELEASE_API="${RELEASE_API:-https://api.github.com/repos/SteamRE/DepotDownloader/releases/latest}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-depot-downloader.sh"
  exit 1
fi

asset_url="$(curl -fsSL "$RELEASE_API" | jq -r '.assets[] | select(.name == "DepotDownloader-linux-arm64.zip") | .browser_download_url')"
if [[ -z "$asset_url" || "$asset_url" == "null" ]]; then
  echo "Could not find the DepotDownloader ARM64 release asset."
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$DEPOT_DOWNLOADER_DIR"
curl -fsSL "$asset_url" -o "$tmpdir/depotdownloader.zip"
unzip -oq "$tmpdir/depotdownloader.zip" -d "$DEPOT_DOWNLOADER_DIR"
chmod +x "$DEPOT_DOWNLOADER_DIR/DepotDownloader"
chown -R "$APP_USER:$APP_USER" "$DEPOT_DOWNLOADER_DIR"

echo "DepotDownloader installed: $DEPOT_DOWNLOADER_DIR/DepotDownloader"
