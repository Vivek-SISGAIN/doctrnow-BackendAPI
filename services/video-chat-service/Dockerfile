FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g prisma
COPY package*.json ./
RUN npm ci --only=production
COPY prisma ./prisma/
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3010/video/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1
CMD ["node", "dist/main.js"]
