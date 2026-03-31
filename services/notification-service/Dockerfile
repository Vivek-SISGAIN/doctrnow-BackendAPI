FROM node:18-alpine

WORKDIR /app

# Install dependencies needed for simple node apps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# create a non-root user for security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

# Expose port the app runs on
EXPOSE 3008

# Start the application
CMD ["npm", "start"]
