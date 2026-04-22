FROM node:22-bookworm-slim

WORKDIR /app

# Build deps for native modules such as `sharp`, plus ffmpeg for starter video uploads.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "run", "start:admin"]
