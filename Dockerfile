# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server

ARG VITE_BAIDU_MAP_AK
ENV VITE_BAIDU_MAP_AK=${VITE_BAIDU_MAP_AK}

RUN npm run build
RUN npm run build:server
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=43101
ENV CORS_ORIGIN_CHECK_ENABLED=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

USER node

EXPOSE 43101

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 43101) + '/api/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
