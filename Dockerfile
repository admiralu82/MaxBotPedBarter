# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- 1. SPA maxapp
# Сборка Vite: outDir = ../data/app относительно /maxapp, т.е. результат попадает в /data/app
FROM node:22-bookworm-slim AS maxapp-build
WORKDIR /maxapp
COPY maxapp/package.json maxapp/package-lock.json ./
RUN npm install
COPY maxapp/ ./
RUN npm run build

# ------------------------------------------------------- 2. зависимости maxbot
# better-sqlite3 — нативный модуль, для сборки нужны python3/make/g++
FROM node:22-bookworm-slim AS maxbot-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /maxbot
COPY maxbot/package.json maxbot/package-lock.json ./
RUN npm install && npm cache clean --force

# ------------------------------------------------------------- 3. образ maxbot
FROM node:22-bookworm-slim
WORKDIR /maxbot

# BASE_DIR=/data -> bot.db, files/, logs/, app/ (см. bot/logger.js:24)
ENV NODE_ENV=production    

# node_modules из стадии сборки (better-sqlite3 собран под тот же базовый образ)
COPY --from=maxbot-deps /maxbot/node_modules ./node_modules
COPY maxbot/ ./

# Собранная SPA хранится в образе отдельно: /data монтируется снаружи и затёр бы её
COPY --from=maxapp-build /data/app /opt/maxapp-dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data/files /data/logs

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "bot"]
