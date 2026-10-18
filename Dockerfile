# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b
LABEL org.opencontainers.image.title="PURL" \
      org.opencontainers.image.description="PURL API/control plane and durable worker"
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/npm/ ./vendor/npm/
# Official integrity-pinned tarballs provide reproducible offline installation.
# No session proxy certificate or server credential is embedded in the image.
RUN npm cache add --offline ./vendor/npm/*.tgz && npm ci --omit=dev --ignore-scripts --strict-ssl=true --no-audit --no-fund --offline && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/.purl && chown node:node /app/.purl
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 PURL_ROLE=api PURL_PERSISTENCE=supabase
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "deploy/healthcheck.js"]
CMD ["node", "service/main.js"]
