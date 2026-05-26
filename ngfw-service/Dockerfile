# Multi-stage Dockerfile for NGFW Service
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
    RUN npm install --production 2>/dev/null || npm install

FROM node:18-alpine

RUN addgroup -S ngfw && adduser -S ngfw -G ngfw

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/logs && chown -R ngfw:ngfw /app

USER ngfw

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
