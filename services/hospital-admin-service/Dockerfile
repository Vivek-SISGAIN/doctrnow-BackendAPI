# ---------- BUILD STAGE ----------
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

RUN npx prisma generate

COPY . .

RUN npm run build


# ---------- PRODUCTION STAGE ----------
FROM node:20-slim

WORKDIR /app

# install only production deps
COPY package*.json ./
RUN npm install --omit=dev

# copy prisma only (no need to regenerate again)
COPY prisma ./prisma/

# copy build output
COPY --from=builder /app/dist ./dist

# copy prisma client from builder (IMPORTANT)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# create user
RUN addgroup --system nodejs && adduser --system --ingroup nodejs nodejs
USER nodejs

EXPOSE 3004
CMD ["node", "dist/server.js"]
