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

# Copy package files + .npmrc (@obilabs registry; auth via NPM_TOKEN injected below)
COPY --chown=nodejs:nodejs package*.json .npmrc ./

# Install all dependencies (including dev for development). @obilabs/licensing
# resolves from GitHub Packages; NPM_TOKEN is supplied via a BuildKit secret mount
# (uid 1001 = the nodejs user that runs this step), never baked into a layer.
RUN --mount=type=secret,id=npm_token,uid=1001 \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm install

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
