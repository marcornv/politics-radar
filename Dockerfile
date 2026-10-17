# Radar Legislativo: site (Next.js) and AI service (Python) in one image.
# Usually started with `docker compose up`, which also runs Ollama; see docker-compose.yml.

FROM node:24.21.0-trixie-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN npm run build

FROM node:24.21.0-trixie-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS ia
COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /usr/local/bin/uv
WORKDIR /app/ia
COPY ia/pyproject.toml ia/uv.lock ./
# Use Debian's Python so the venv works in the final image, which has no uv.
ENV UV_PYTHON=/usr/bin/python3 UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
RUN uv sync --frozen --no-dev

FROM base
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 RADAR_DIR=/app
COPY --from=web --chown=node:node /app/.next/standalone ./
COPY --from=web --chown=node:node /app/.next/static ./.next/static
COPY --from=web --chown=node:node /app/public ./public
COPY --from=ia --chown=node:node /app/ia/.venv ./ia/.venv
COPY --chown=node:node ia/radar_ia ./ia/radar_ia
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
# Keys (.config) and the cache (.cache) live in volumes; create them owned by the app user.
RUN mkdir -p .config .cache && chown node:node .config .cache
USER node
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
