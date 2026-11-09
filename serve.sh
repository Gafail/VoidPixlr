#!/usr/bin/env bash
# VoidPixlr — local preview server.
#
# Usage:
#   ./serve.sh          # serve on http://127.0.0.1:8790
#   ./serve.sh 9000     # serve on a specific port
#
# Serves the webroot (site/) as plain static files, exactly as nginx will in
# production. No build step, no dependencies.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8790}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required to serve the site." >&2
  exit 1
fi

echo "VoidPixlr → http://127.0.0.1:${PORT}/"
echo "Serving ${SCRIPT_DIR}/site — Ctrl-C to stop."

exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SCRIPT_DIR/site"
