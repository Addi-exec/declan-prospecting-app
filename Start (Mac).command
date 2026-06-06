#!/bin/bash
# Double-click this to open the Prospecting App on a Mac.
# First run sets everything up automatically (needs internet once).

cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "----------------------------------------"
echo "  Declan Prospecting App"
echo "----------------------------------------"

if ! command -v npm >/dev/null 2>&1; then
  echo ""
  echo "Node.js isn't installed yet."
  echo "Please install the 'LTS' version from https://nodejs.org"
  echo "then double-click this file again."
  echo ""
  read -p "Press Return to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo ""
  echo "First-time setup: installing the app (one time, needs internet)..."
  npm install || { echo "Setup failed. Check your internet and try again."; read -p "Press Return to close..."; exit 1; }
fi

echo ""
echo "Opening the app..."
npm start
