# ---------- BUILD STAGE ----------
FROM node:18-bullseye AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --legacy-peer-deps
RUN npx prisma generate

COPY . .

RUN npm run build


# ---------- PRODUCTION STAGE ----------
FROM node:18-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY prisma ./prisma/

COPY --from=builder /app/dist ./dist

# prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN addgroup --system nodejs && adduser --system --ingroup nodejs nodejs
USER nodejs

EXPOSE 3001


CMD ["node", "dist/main.js"]