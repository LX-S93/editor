#!/bin/sh
# Healthcheck matching PASCAL_MODE (see entrypoint.sh).
set -eu

case "${PASCAL_MODE:-editor}" in
  mcp)
    exec wget -q -O /dev/null \
      --header "Authorization: Bearer ${PASCAL_MCP_HTTP_TOKEN:-}" \
      "http://127.0.0.1:${MCP_PORT:-8787}/health"
    ;;
  *)
    exec wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/"
    ;;
esac
