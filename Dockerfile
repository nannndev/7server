# 7Server: dashboard + API + AI gateway on one port. Data (7server.db, secret.key) lives in /data.
#   docker compose up -d        (see docker-compose.yml)

# ---- 1. build the dashboard
FROM node:26-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- 2. server dependencies (production only; tsx runs the TypeScript like `npm start`)
FROM node:26-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm install --no-save --no-audit --no-fund tsx@4

# ---- 3. runtime
FROM node:26-alpine
# openssh-client: ssh-keygen for key tools; tini: clean signal handling for the SSH/WebSocket sessions
RUN apk add --no-cache tini openssh-client
ENV NODE_ENV=production \
    PORT=5001 \
    VPSHUB_DATA_DIR=/data \
    STATIC_DIR=/app/client/dist \
    RUNNING_IN_DOCKER=1
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY server/tsconfig.json ./
COPY --from=client /app/client/dist /app/client/dist
# Non-root; /data is the only writable path the app needs.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5001/api/ai/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "src/index.ts"]
