# THE DEPLOYED IMAGE.
#
# One process serving two things: the built browser app, and the API that holds
# the credential. They are one image on purpose -- a split would put the app on
# a different origin from its own API, which buys a CORS policy, a second deploy
# target, and a class of failure where half a release is live.
#
# The build context this expects is the REPOSITORY ROOT, and `.dockerignore`
# beside this file is what makes that affordable: without it the daemon receives
# `knowledge/` first, which is 11 GB of mirrored corpora that nothing here reads.

# ----------------------------------------------------------------- build ----
# Pinned to a digest-stable minor, never `:22` and never `:latest`. A floating
# tag means the same commit produces different images on different days, and an
# image nobody can reproduce is not evidence of anything.
FROM node:22.14.0-bookworm-slim AS build

WORKDIR /app

# DEPENDENCIES FIRST, AS THEIR OWN LAYER.
# Copying the manifests alone means an edit to source code does not invalidate
# the install layer. `npm ci` rather than `npm install`: it installs exactly the
# lockfile, and fails instead of silently resolving a different tree.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/

# TWO BUNDLES, TWO PURPOSES.
#   dist/         the browser app, hashed asset names, served as files
#   dist-server/  the API, bundled because the server imports the browser's own
#                 validator and Node's ESM resolver will not follow the
#                 extensionless specifiers that module uses
#
# `vite build` is called directly rather than through `npm run build`, which
# also runs `tsc` over the browser projects. Type checking is a gate that
# belongs in CI, where a failure is reported against a commit; running it here
# means a type error in an unrelated file stops a deployment with a message
# nobody sees until the build log is opened.
RUN cd frontend \
 && npx vite build \
 && npx vite build --config vite.server.config.ts \
 && node scripts/server-externals.mjs --check

# --------------------------------------------------------------- runtime ----
FROM node:22.14.0-bookworm-slim AS runtime

# NOT ROOT. The image ships a node user; a process that only reads its own
# bundle and writes one ledger file has no reason to be able to write anywhere
# else in the filesystem.
WORKDIR /app
ENV NODE_ENV=production

# ONE PACKAGE, NOT THE TREE.
#
# `npm ci --omit=dev` here cost 284 MB, and 268 MB of that was browser
# libraries -- echarts, three, hls.js, mediapipe -- which `vite build` has
# already inlined into `dist/` and which this Node process never loads.
#
# The bundle inlines every workspace module, so all that remains external is
# Node's own builtins plus `zod`. Copied from the build stage rather than
# installed again, so the version is the one the lockfile already resolved
# instead of whatever a second resolution picks.
#
# `scripts/server-externals.mjs --check` runs in the build stage above and
# fails the BUILD if the bundle ever needs a package not listed here -- the
# alternative being ERR_MODULE_NOT_FOUND in production on an untested route.
COPY frontend/package.json ./
COPY --from=build /app/frontend/node_modules/zod ./node_modules/zod
# The PostgreSQL driver and its own dependency tree. The ledger is shared state
# now, because a file cannot be: two replicas on one file lost 28 of 60 marks.
COPY --from=build /app/frontend/node_modules/pg ./node_modules/pg
COPY --from=build /app/frontend/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=build /app/frontend/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=build /app/frontend/node_modules/pg-types ./node_modules/pg-types
COPY --from=build /app/frontend/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=build /app/frontend/node_modules/pgpass ./node_modules/pgpass
COPY --from=build /app/frontend/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=build /app/frontend/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=build /app/frontend/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=build /app/frontend/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=build /app/frontend/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=build /app/frontend/node_modules/split2 ./node_modules/split2
COPY --from=build /app/frontend/node_modules/xtend ./node_modules/xtend

COPY --from=build /app/frontend/dist-server ./dist-server
COPY --from=build /app/frontend/dist ./dist

# THE LEDGER'S DIRECTORY, CREATED AND OWNED BEFORE THE PROCESS DROPS PRIVILEGE.
# `fileStore.ts` creates it on first write, but it cannot create it inside a
# directory it may not write to. Getting this wrong produces the worst failure
# shape there is: the server starts, logs "listening", and returns 500 to the
# first student who opens their day.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

# WHY 0.0.0.0 IS SET HERE AND NOT IN THE SOURCE.
# `index.ts` binds loopback by default because a process holding a credential
# should not be reachable from a cafe network by accident. A container has its
# own network namespace, so binding every interface inside it exposes nothing
# the orchestrator did not already publish. The decision is made by the
# deployment, which is exactly where it belongs.
ENV HOST=0.0.0.0
ENV PORT=8787
ENV WEB_ROOT=/app/dist
ENV ALMANAC_LEDGER=/app/data/almanac-ledger.json

EXPOSE 8787

# Uses the app's own health route rather than a TCP probe. A socket that accepts
# a connection proves the process is alive; it does not prove the process can
# answer, and "up but answering 500" is the state a restart would fix.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/index.js"]
