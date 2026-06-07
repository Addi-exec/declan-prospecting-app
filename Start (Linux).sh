#!/bin/bash
# Open the Prospecting App on Linux (e.g. Linux Mint).
# First run sets everything up automatically (needs internet once).
#
# If double-clicking doesn't run it, make it executable once:
#   chmod +x "Start (Linux).sh"
# then double-click (choose "Run") or run it from a terminal:
#   ./"Start (Linux).sh"

cd "$(dirname "$0")"
export PATH="/usr/local/bin:/usr/bin:$PATH"

echo "----------------------------------------"
echo "  Declan Prospecting App"
echo "----------------------------------------"

if ! command -v npm >/dev/null 2>&1; then
  echo ""
  echo "Node.js isn't installed yet."
  echo "Install the 'LTS' version, e.g. on Linux Mint / Ubuntu:"
  echo "    sudo apt update && sudo apt install nodejs npm"
  echo "  (or get the LTS installer from https://nodejs.org)"
  echo "then run this file again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo ""
  echo "First-time setup: installing the app (one time, needs internet)..."
  npm install || { echo "Setup failed. Check your internet and try again."; read -p "Press Enter to close..."; exit 1; }
fi

# If the Electron engine didn't unpack (a known npm/Node hiccup), the app won't start.
# This recovers it from the local cache without a reinstall.
if [ ! -f "node_modules/electron/path.txt" ]; then
  echo ""
  echo "Repairing the app engine (one-time)..."
  node node_modules/electron/install.js 2>/dev/null || true
fi

echo ""
echo "Opening the app..."
npm start
