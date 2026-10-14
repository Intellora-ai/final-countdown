# syntax=docker/dockerfile:1
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=cloud_ca if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; ONNXRUNTIME_NODE_INSTALL=skip npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /app/frontend
ENV NODE_ENV=production HOST=0.0.0.0 CANVAS_STATE_DIR=/app/state
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=cloud_ca if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; ONNXRUNTIME_NODE_INSTALL=skip npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/frontend/dist ./dist
COPY --from=build /app/frontend/dist-server ./dist-server
RUN mkdir -p /app/state && chown -R node:node /app/state /app/frontend
USER node
EXPOSE 8787
CMD ["node", "dist-server/index.js"]
