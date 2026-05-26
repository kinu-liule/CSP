# Multi-stage Dockerfile for Fraud Detection Service
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
    RUN npm install --production 2>/dev/null || npm install

FROM node:18-alpine

RUN addgroup -S fraud && adduser -S fraud -G fraud

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/logs && chown -R fraud:fraud /app

USER fraud

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
