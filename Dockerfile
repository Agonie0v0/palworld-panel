FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tar docker.io docker-compose-plugin \
    build-essential git python3 python3-dev python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY config.example.json ./
COPY src ./src
COPY public ./public
COPY upstream-web/dist ./upstream-web/dist
COPY upstream-web/public ./upstream-web/public
COPY parsers ./parsers
COPY scripts ./scripts

ARG PST_TOOLS_REF=8cb429ae3b1460a6a6a0c31c9964ca8cedb65cc5
RUN python3 -m venv /app/parsers/sav_cli/.venv \
  && /app/parsers/sav_cli/.venv/bin/python -m pip install --upgrade pip setuptools wheel \
  && /app/parsers/sav_cli/.venv/bin/python -m pip install --no-cache-dir -r /app/parsers/sav_cli/requirements/runtime.txt \
  && git clone https://github.com/deafdudecomputers/PalworldSaveTools.git /tmp/PalworldSaveTools \
  && git -C /tmp/PalworldSaveTools checkout ${PST_TOOLS_REF} \
  && /app/parsers/sav_cli/.venv/bin/python -m pip install --no-cache-dir --no-build-isolation --no-deps /tmp/PalworldSaveTools/src/palsav/palooz \
  && /app/parsers/sav_cli/.venv/bin/python -m pip install --no-cache-dir --no-build-isolation --no-deps /tmp/PalworldSaveTools/src/palsav \
  && chmod +x /app/parsers/sav_cli/run-save-parser \
  && rm -rf /tmp/PalworldSaveTools

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=19090 \
    PAL_PANEL_CONFIG=/data/config.json \
    SAVE_PARSER_COMMAND=/app/parsers/sav_cli/run-save-parser

EXPOSE 19090
VOLUME ["/data", "/backups", "/palworld"]

CMD ["node", "src/server.js"]
