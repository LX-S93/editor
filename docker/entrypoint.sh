#!/bin/sh
# One image, two roles, chosen by PASCAL_MODE:
#   editor (default)  the web editor on $PORT (3000)
#   mcp               the MCP server (Streamable HTTP, /mcp) on $MCP_PORT (8787)
# Both roles read and write the same SQLite database in PASCAL_DATA_DIR, so run
# them as two containers that mount the same /data.
set -eu

APP_DIR="${PASCAL_APP_DIR:-/app}"

case "${PASCAL_MODE:-editor}" in
  editor)
    cd "$APP_DIR/apps/editor"
    exec bun run start
    ;;
  mcp)
    if [ -z "${PASCAL_MCP_HTTP_TOKEN:-}" ]; then
      echo "PASCAL_MCP_HTTP_TOKEN must be set when PASCAL_MODE=mcp (the server listens on the network)." >&2
      exit 1
    fi
    # Setting an instance id enables the server's /health endpoint.
    export PASCAL_INSTANCE_ID="${PASCAL_INSTANCE_ID:-pascal-mcp}"
    cd "$APP_DIR"
    # The token is read from the environment, not argv, so it stays out of `ps`.
    exec bun packages/mcp/dist/bin/pascal-mcp.js --http --host 0.0.0.0 --port "${MCP_PORT:-8787}"
    ;;
  *)
    echo "Unknown PASCAL_MODE '${PASCAL_MODE}'. Use 'editor' or 'mcp'." >&2
    exit 1
    ;;
esac
