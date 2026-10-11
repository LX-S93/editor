# Matches `packageManager` in package.json and the version CI installs — a skew
# here is what makes `--frozen-lockfile` fail inside the image but not locally.
FROM oven/bun:1.3.14-alpine
WORKDIR /app

# `next build` runs under `node`, and this image's `node` is a shim that re-execs
# bun (/usr/local/bun-node-fallback-bin/node). Next 16's build crashes it — a
# segfault on 1.3.14, a turbopack CommonJS wrapper error on 1.3.0 — on both arm64
# and amd64. CI does not hit this because GitHub runners have a real node.
RUN apk add --no-cache nodejs

COPY . .
RUN bun install --frozen-lockfile
RUN ./node_modules/.bin/turbo run build --filter=editor

# Saved scenes live in SQLite under PASCAL_DATA_DIR; owned by the runtime user so
# the store can create the database on first write.
#
# The runtime user defaults to 99:100 (Unraid's nobody:users), which owns the
# appdata shares a bind-mounted /data comes from. Override with
# --build-arg PUID=... --build-arg PGID=... or `docker run --user` for other hosts.
ARG PUID=99
ARG PGID=100
RUN mkdir -p /data && chown -R ${PUID}:${PGID} /data /app
ENV PASCAL_DATA_DIR=/data \
    HOME=/tmp \
    PORT=3000
VOLUME /data

USER ${PUID}:${PGID}
EXPOSE 3000
WORKDIR /app/apps/editor

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["bun", "run", "start"]
