FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY tests ./tests
COPY next.config.mjs tsconfig.json ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/tmp/build.db
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/lib ./lib
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/tsconfig.json /app/next.config.mjs ./
RUN mkdir -p /data/held && chown -R node:node /data
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 RELEASE_MODE=founder DATABASE_URL=file:/data/nikki.db HELD_DIR=/data/held
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node","scripts/deploy-start.mjs"]
