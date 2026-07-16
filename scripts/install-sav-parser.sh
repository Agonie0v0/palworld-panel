#!/usr/bin/env bash
set -euo pipefail

PARSER_DIR="${PARSER_DIR:-/opt/palworld-panel/parsers/sav_cli}"
PST_TOOLS_REF="${PST_TOOLS_REF:-8cb429ae3b1460a6a6a0c31c9964ca8cedb65cc5}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-sav-parser.sh"
  exit 1
fi

apt-get update
apt-get install -y \
  build-essential \
  ca-certificates \
  git \
  python3 \
  python3-dev \
  python3-venv

python3 -m venv "$PARSER_DIR/.venv"
"$PARSER_DIR/.venv/bin/python" -m pip install --upgrade pip setuptools wheel
"$PARSER_DIR/.venv/bin/python" -m pip install --no-cache-dir -r "$PARSER_DIR/requirements/runtime.txt"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone https://github.com/deafdudecomputers/PalworldSaveTools.git "$TMP_DIR/PalworldSaveTools"
git -C "$TMP_DIR/PalworldSaveTools" checkout "$PST_TOOLS_REF"

"$PARSER_DIR/.venv/bin/python" -m pip install --no-cache-dir --no-build-isolation --no-deps \
  "$TMP_DIR/PalworldSaveTools/src/palsav/palooz"
"$PARSER_DIR/.venv/bin/python" -m pip install --no-cache-dir --no-build-isolation --no-deps \
  "$TMP_DIR/PalworldSaveTools/src/palsav"

chmod +x "$PARSER_DIR/run-save-parser"

echo "sav_cli parser installed: $PARSER_DIR/run-save-parser"
