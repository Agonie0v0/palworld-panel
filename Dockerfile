FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tar docker.io docker-compose-plugin \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY config.example.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    PAL_PANEL_CONFIG=/data/config.json

EXPOSE 8080
VOLUME ["/data", "/backups", "/palworld"]

CMD ["node", "src/server.js"]
