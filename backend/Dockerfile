FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

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

# Copy package files. @obilabs/* are public on npmjs — no .npmrc, no token.
COPY --chown=nodejs:nodejs package*.json ./

# Install all dependencies from the lockfile (including dev). @obilabs/licensing
# resolves anonymously from npmjs — no BuildKit secret, no NPM_TOKEN.
RUN npm ci

# Copy tsconfig
COPY --chown=nodejs:nodejs tsconfig.json ./

# Copy source code
COPY --chown=nodejs:nodejs src ./src

# Ship the incremental SQL migrations so the boot-time runner finds them at
# /app/database/migrations. (docker-compose.dev.yml also bind-mounts
# ./backend/database over this for live editing without a rebuild.)
COPY --chown=nodejs:nodejs database ./database

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application in development mode
CMD ["npm", "run", "dev"]
