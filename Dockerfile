# syntax=docker/dockerfile:1
FROM node:24-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=cloud_ca if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-slim
WORKDIR /app/frontend
ENV NODE_ENV=production HOST=0.0.0.0
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=cloud_ca if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/frontend/dist ./dist
COPY --from=build /app/frontend/dist-server ./dist-server
EXPOSE 8787
CMD ["node", "dist-server/index.js"]
