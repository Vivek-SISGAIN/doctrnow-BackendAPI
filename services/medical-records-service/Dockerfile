# ---------- BUILD STAGE ----------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

RUN npx prisma generate

COPY . .

RUN npm run build


# ---------- PRODUCTION STAGE ----------
FROM node:18-alpine

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
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

EXPOSE 3005
CMD ["node", "dist/server.js"]
