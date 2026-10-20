#!/usr/bin/env bash
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$PROJECT_DIR/.tools/node-v22.14.0-linux-x64/bin:$PATH"

if [ "$1" = "install" ]; then
  npm install
elif [ "$1" = "dev" ]; then
  npm run dev
elif [ "$1" = "build" ]; then
  npm run build
else
  "$@"
fi
