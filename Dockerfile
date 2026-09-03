# syntax=docker/dockerfile:1
#
# ONE IMAGE, ONE URL. This builds the Vite frontend and bundles the Node API
# server, then ships a runtime image that serves BOTH from a single process —
# so one Railway deploy gives one domain where the app and its /api/* live.
#
# WHY NODE 24 (not the platform default). The server imports `node:sqlite`
# (canvas memory) at startup. That builtin is usable without a flag only on
# Node >= 23.4, so the Node version is pinned here rather than left to a
# builder's default, which is where "works on my machine, ERR_UNKNOWN_BUILTIN
# _MODULE in prod" comes from.
#
# WHY THE RUNTIME STAGE INSTALLS TWO PACKAGES. Vite bundles the server (see
# vite.server.config.ts) but leaves node_modules deps external. Verified against
# the built bundle: its only non-`node:` imports are `pg` and `zod`. So the
# runtime image is Node + the two build outputs + exactly those two packages —
# not a full install. Caught the honest way: a runtime image without them
# crashes at boot with "Cannot find package 'pg'".

# ---- build stage: compile the SPA and bundle the server ---------------------
FROM node:24-slim AS build
WORKDIR /app/frontend
# The SPA bundles heavy chunks (three.js scene, echarts). Give V8 room so the
# minify pass does not hit the default heap ceiling on a large builder. This
# does NOT help a builder with < ~3 GB total RAM — that needs more builder
# memory (Railway's builders have it; a 2 GB local Docker VM does not).
ENV NODE_OPTIONS=--max-old-space-size=4096

# Deps first, with the lockfile, so this layer caches until the lockfile changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# The frontend sources (node_modules is excluded by .dockerignore, so this does
# not clobber the install above).
COPY frontend/ ./

# Build the SPA (dist/) and bundle the server (dist-server/). These are the two
# commands proven locally to produce a server that serves both; the typecheck
# gate is intentionally not on the deploy path.
RUN npx vite build \
 && npx vite build --config vite.server.config.ts

# ---- runtime stage: just Node + the built artifacts -------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
# Railway (and any proxy host) reaches the container from outside, so bind all
# interfaces rather than loopback. PORT is provided by the platform at runtime.
ENV HOST=0.0.0.0
# Persist the student's canvas memory, the ledger, and the identity secret on a
# mounted volume by default, so they survive a redeploy. Overridable per-var.
ENV CANVAS_MEMORY_DB=/data/canvas-memory.db
ENV ALMANAC_LEDGER=/data/almanac-ledger.json
ENV ALMANAC_IDENTITY_SECRET_FILE=/data/identity-secret

WORKDIR /app/frontend

# The server bundle is self-contained EXCEPT for two deps Vite leaves external:
# `pg` and `zod` (verified: they are the only non-`node:` imports in
# dist-server/index.js). Install exactly those, pinned to the versions in
# frontend/package-lock.json — a full prod install would drag in the
# frontend-only deps (three, echarts, react) the server never loads. The
# `type: module` package.json makes Node treat the ESM bundle as ESM with no
# reparse. Proven: without this, the container crashes at boot with
# "Cannot find package 'pg'".
RUN printf '{"type":"module","private":true}\n' > package.json \
 && npm install --no-audit --no-fund pg@8.23.0 zod@3.25.76

COPY --from=build /app/frontend/dist        ./dist
COPY --from=build /app/frontend/dist-server ./dist-server

# A home for the sqlite file / ledger / secret. Mount a Railway volume here so
# it persists; without a volume it is ephemeral (fine for a first smoke test).
RUN mkdir -p /data

# Documentation only; Railway routes to $PORT regardless of EXPOSE.
EXPOSE 8787

CMD ["node", "dist-server/index.js"]
