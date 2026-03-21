# ---------- BUILD STAGE ----------
  FROM node:18-alpine AS builder

  WORKDIR /app
  
  COPY package*.json ./
  COPY prisma ./prisma/
  
  RUN npm ci
  
  RUN npx prisma generate
  
  COPY . .
  
  RUN npm run build
  
  
  # ---------- PRODUCTION STAGE ----------
  FROM node:18-alpine
  
  WORKDIR /app
  
  # install only production deps
  COPY package*.json ./
  RUN npm ci --omit=dev
  
  # copy prisma only (no need to regenerate again)
  COPY prisma ./prisma/
  
  # copy build output
  COPY --from=builder /app/dist ./dist
  
  # copy prisma client from builder (IMPORTANT)
  COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
  COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
  
  # create user
  RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
  USER nodejs
  
EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/audit/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1
CMD ["node", "dist/main.js"]
