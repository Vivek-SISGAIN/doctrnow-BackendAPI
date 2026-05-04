# ---------- BUILD STAGE ----------
  FROM node:22-slim AS builder

  WORKDIR /app
  
  COPY package*.json ./
  COPY prisma ./prisma/
  
  RUN npm install --legacy-peer-deps

  # Pin TypeScript to v5 inside the builder only — the project's TS 6.x errors on
  # the deprecated `moduleResolution: "node"` setting in tsconfig.json. Avoids
  # touching package.json / tsconfig on the host.
  RUN npm install --no-save --legacy-peer-deps typescript@5

  RUN npx prisma generate

  COPY . .

  RUN npm run build
  
  
  # ---------- PRODUCTION STAGE ----------
  FROM node:22-slim
  
  WORKDIR /app
  
  # install only production deps
  COPY package*.json ./
  RUN npm install --omit=dev --legacy-peer-deps
  
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
  
EXPOSE 3008

# Start the application
CMD ["npm", "start"]
