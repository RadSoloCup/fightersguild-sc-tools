FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY LICENSE ./
COPY src ./src

ENV STATE_DIR=/data
VOLUME ["/data"]
RUN mkdir -p /data && chown -R node:node /app /data
USER node

CMD ["node", "src/index.js"]
