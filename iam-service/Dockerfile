# Multi-stage Dockerfile for IAM Service
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine

RUN addgroup -S iam && adduser -S iam -G iam

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY ../common ./common
COPY . .

RUN mkdir -p /app/logs && chown -R iam:iam /app

USER iam

EXPOSE 3008

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3008/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
