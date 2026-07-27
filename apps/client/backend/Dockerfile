FROM node:20-alpine

# Create non-root user FIRST (before any file operations)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install system dependencies
RUN apk add --no-cache curl

# Create app directory with correct ownership
WORKDIR /app
RUN chown nodejs:nodejs /app

# Create logs directory with correct ownership
RUN mkdir -p /app/logs && chown nodejs:nodejs /app/logs

# Switch to non-root user BEFORE any file operations
USER nodejs

# Copy package files (already owned by nodejs due to USER switch)
COPY --chown=nodejs:nodejs package*.json ./

# Install all dependencies (including dev for development)
RUN npm install

# Copy tsconfig
COPY --chown=nodejs:nodejs tsconfig.json ./

# Copy source code
COPY --chown=nodejs:nodejs src ./src

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application in development mode
CMD ["npm", "run", "dev"]
