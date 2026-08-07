FROM node:24.14.0-bullseye-slim AS base

# Set environment variables early for better layer caching
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Install all system dependencies in a single layer with cache mounts
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openssh-client \
        python3 \
        g++ \
        build-essential \
        cmake \
        pkg-config \
        git \
        poppler-utils \
        poppler-data \
        procps \
        locales \
        unzip \
        curl \
        ca-certificates \
        iptables \
        libcap-dev && \
    yarn config set python /usr/bin/python3 && \
    sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen en_US.UTF-8

RUN export ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      curl -fSL https://github.com/oven-sh/bun/releases/download/bun-v1.3.1/bun-linux-x64-baseline.zip -o bun.zip; \
    elif [ "$ARCH" = "aarch64" ]; then \
      curl -fSL https://github.com/oven-sh/bun/releases/download/bun-v1.3.1/bun-linux-aarch64.zip -o bun.zip; \
    fi

RUN unzip bun.zip \
    && mv bun-*/bun /usr/local/bin/bun \
    && chmod +x /usr/local/bin/bun \
    && rm -rf bun.zip bun-*

RUN bun --version

# Install global npm packages in a single layer
RUN npm install -g --no-fund --no-audit \
    node-gyp \
    npm@11.11.0 \
    pm2@6.0.10 \
    typescript@4.9.4 \
    esbuild@0.25.0

# Install isolated-vm globally (needed for sandboxes)
RUN cd /usr/src && bun install isolated-vm@6.0.2

### STAGE 1: Build ###
FROM base AS build

WORKDIR /usr/src/app

# Copy dependency files and workspace package.json files for resolution
COPY .npmrc package.json bun.lock bunfig.toml ./
COPY packages/ ./packages/

# Install all dependencies with frozen lockfile
RUN bun install --frozen-lockfile

# Copy remaining source code (turbo config, etc.)
COPY . .

# Build frontend, engine, server API, and worker
RUN npx turbo run build --filter=web --filter=@activepieces/engine --filter=api --filter=worker \
    --filter=@activepieces/piece-passgrad-form --filter=@activepieces/piece-passgrad-table

# The web build emits hidden source maps (vite build.sourcemap='hidden') used to
# symbolicate production stack traces in Sentry/BetterStack error tracking. Upload
# them here (cloud CI, guarded by a token) BEFORE stripping, then always remove the
# .map files so source is never served from the shipped image (self-hosted too).
# TODO(cloud-ci): inject + upload maps with sentry-cli when SENTRY_AUTH_TOKEN is set.
RUN find dist/packages/web -name '*.map' -delete

# Generate migration manifest (ordered list of migration names) for image-tag-based rollback
RUN node -e "\
  const {getMigrations} = require('./packages/server/api/dist/src/app/database/postgres-connection');\
  const names = getMigrations().map(M => new M().name);\
  process.stdout.write(JSON.stringify(names));\
" > packages/server/api/dist/src/migration-manifest.json

### STAGE 2: Run ###
FROM base AS run

WORKDIR /usr/src/app

ENV AP_DEV_PIECES=passgrad-form,passgrad-table

# Copy static configuration files first (better layer caching)
COPY --from=build /usr/src/app/packages/server/api/src/assets/default.cf /usr/local/etc/isolate
COPY docker-entrypoint.sh .

# Create all necessary directories in one layer
RUN mkdir -p \
    /usr/src/app/dist/packages/engine && \
    chmod +x docker-entrypoint.sh

# Copy root config files needed for dependency resolution
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/.npmrc ./
COPY --from=build /usr/src/app/bun.lock ./
COPY --from=build /usr/src/app/bunfig.toml ./
COPY --from=build /usr/src/app/LICENSE .

# Copy workspace package.json files (needed for bun workspace resolution)
COPY --from=build /usr/src/app/packages ./packages

# Copy built engine
COPY --from=build /usr/src/app/dist/packages/engine/ ./dist/packages/engine/

# Install production dependencies (pieces pre-trimmed in source, lockfile already matches)
RUN bun install --production --frozen-lockfile

# Copy frontend files
COPY --from=build /usr/src/app/dist/packages/web ./dist/packages/web/

LABEL service=activepieces

ENTRYPOINT ["./docker-entrypoint.sh"]
EXPOSE 80
