FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
# Create the trainer, default documents and 30 days of slots on first boot
# (idempotent; can be disabled via SEED_DATABASE_ON_STARTUP=false in the dashboard).
ENV SEED_DATABASE_ON_STARTUP=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Apply the DB schema (idempotent), then start the server.
CMD ["sh", "-c", "npm run migrate:prod && npm run start"]
