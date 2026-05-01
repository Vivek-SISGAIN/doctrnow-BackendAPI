# ---------- BUILD STAGE ----------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install
RUN npx prisma generate

# ---------- PRODUCTION STAGE ----------
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma/
COPY src ./src/

# copy prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# set correct ownership BEFORE switching user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs \
    && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000


# NO prisma generate at runtime — already done in builder
# --accept-data-loss is required to apply schema changes that *may* drop data
# (e.g. adding a unique constraint that fails if duplicates exist). It does NOT
# auto-resolve duplicates — Postgres still rejects the migration if real dups
# are present. If startup fails on a unique-constraint error, deduplicate the
# offending column manually before retrying.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/server.js"]