# ---------- BUILD STAGE ----------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci


COPY . .

RUN npm run build


# ---------- PRODUCTION STAGE ----------
FROM node:18-alpine

WORKDIR /app

# install only production deps
COPY package*.json ./
RUN npm ci --omit=dev


# copy build output
COPY --from=builder /app/dist ./dist


# create user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3010/video/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1
CMD ["node", "dist/server.js"]
