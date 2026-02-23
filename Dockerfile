# ---------- Base stage (dependencies layer) ----------
FROM node:20-alpine AS base
WORKDIR /app

# Install OS deps (optional: openssl for argon2, python3/make/g++ for native builds)
RUN apk add --no-cache bash python3 make g++ openssl

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Prefer yarn if yarn.lock exists, else npm
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

COPY tsconfig*.json nest-cli.json .eslintrc* eslint.config.mjs ./
COPY src ./src
COPY scripts ./scripts

# Build TypeScript -> dist
RUN if [ -f yarn.lock ]; then yarn build; \
    elif [ -f package-lock.json ]; then npm run build; \
    else npm run build; fi

# ---------- Production runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Install postgresql-client for backups
RUN apk add --no-cache postgresql-client

# Copy only needed artifacts
COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist

USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD node dist/main.js --healthcheck || exit 1

CMD ["node", "dist/src/main.js"]
