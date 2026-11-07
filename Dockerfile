# One image with the whole product:
#   - the React dashboard, built once and served by the API
#   - the Node API (Fastify) on $PORT
#   - the Python AI service (FastAPI) on 127.0.0.1:8001, reachable only from inside
# PostgreSQL is external (DATABASE_URL), e.g. Neon, RDS, or the compose service.

# ---- 1. Build the dashboard --------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 2. Runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies first (they change least often, so this layer is cached)
COPY ai/requirements.txt ai/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r ai/requirements.txt

# Node production dependencies
COPY api/package.json api/package-lock.json api/
RUN cd api && npm ci --omit=dev

# Application code
COPY api/src api/src
COPY api/tsconfig.json api/
COPY ai/app ai/app
COPY --from=web /app/web/dist web/dist
COPY deploy/start.sh deploy/start.sh

# NODE_OPTIONS caps the JS heap so the process garbage-collects early instead of
# growing until a 512 MB container (Render free) kills it. Measured peak for the
# whole container while importing a 6,977-activity / 18 MB schedule: ~390 MB.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    NODE_OPTIONS=--max-old-space-size=256

# Run as the unprivileged "node" user that the base image provides
RUN chown -R node:node /app
USER node

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "deploy/start.sh"]
