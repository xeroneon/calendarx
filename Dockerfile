# syntax=docker/dockerfile:1
# CalendarX — self-hosted CalDAV-generic calendar + tasks (web + API, single image).
#
# Build the whole workspace with pnpm/turbo, then ship the built web + API with
# their runtime deps. Two processes run inside the one container (entrypoint.sh):
#   :3101  the thin CalDAV proxy / account gate (apps/server)
#   :3006  the TanStack web app served by srvx (apps/web)
#
# Build:  docker build -t calendarx .
# Run:    docker compose up -d        (see docker-compose.yml)

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
COPY . .

# --frozen-lockfile: pnpm-lock.yaml is the single source of truth.
RUN pnpm install --frozen-lockfile
# Build every workspace package that has a build script (turbo skips the rest).
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy the FULL built workspace: pnpm's node_modules are symlinked across
# packages, so the runtime must see the same layout the build produced.
COPY --from=build /app /app

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Web + API ports.
EXPOSE 3006 3101
# Persist accounts / connections / push subscriptions across container restarts.
# Compose overrides this with a bind mount (./data:/data) — see the compose file.
VOLUME /app/.data

ENTRYPOINT ["/entrypoint.sh"]