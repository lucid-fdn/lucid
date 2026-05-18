# Lucid Assistant Worker — 2-stage Docker build
# Stage 1 (builder): compile openclaw-runtime + worker
# Stage 2 (runner): minimal production image, no source code
# Build: 2026-03-07b

# ══════════════════════════════════════════════
# Builder — compiles everything, installs all deps
# ══════════════════════════════════════════════
FROM node:22-slim AS builder
WORKDIR /build
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_MAXSOCKETS=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy openclaw source (build input only — NOT in final image)
COPY packages/openclaw-core/ ./packages/openclaw-core/

# Copy openclaw-runtime package
COPY packages/openclaw-runtime/ ./packages/openclaw-runtime/
COPY packages/hermes-runtime/ ./packages/hermes-runtime/
COPY packages/runtime-compat/ ./packages/runtime-compat/
COPY packages/agent-routing/ ./packages/agent-routing/

# Copy local workspace packages (file: dependencies in worker/package.json)
COPY packages/agent-tools-core/ ./packages/agent-tools-core/
COPY packages/code-interpreter/ ./packages/code-interpreter/
COPY packages/content/ ./packages/content/
COPY packages/embedded/ ./packages/embedded/
COPY packages/web3-operator/ ./packages/web3-operator/
COPY packages/web3-types/ ./packages/web3-types/
COPY packages/agent-bridge/ ./packages/agent-bridge/
COPY packages/integration-auth/ ./packages/integration-auth/
COPY packages/plugin-executor/ ./packages/plugin-executor/
COPY packages/plugin-policy/ ./packages/plugin-policy/
COPY packages/browser-checkout-adapter/ ./packages/browser-checkout-adapter/

# Build local packages (they export from dist/, zero runtime deps)
# Order matters: agent-tools-core before web3-operator (operator depends on it)
# plugin-policy before plugin-executor (executor depends on policy)
RUN cd packages/agent-tools-core && npm install && npm run build
RUN cd packages/code-interpreter && npm install && npm run build
RUN cd packages/content && npm install && npm run build
RUN cd packages/web3-types && npm install && npm run build
RUN cd packages/web3-operator && npm install && npm run build
RUN cd packages/agent-bridge && npm install && npm run build
RUN cd packages/agent-routing && npm install && npm run build
RUN cd packages/runtime-compat && npm install && npm run build
RUN cd packages/plugin-policy && npm install && npm run build
RUN cd packages/integration-auth && npm install && npm run build
RUN cd packages/plugin-executor && npm install && npm run build
RUN cd packages/browser-checkout-adapter && npm install && npm run build
RUN cd packages/hermes-runtime && npm install && npm run build
RUN cd packages/embedded && \
    npm exec --yes \
      --package tsup@^8.4.0 \
      --package typescript@^5.6.0 \
      -- tsup src/index.ts \
        --no-config \
        --format esm \
        --target node20 \
        --out-dir dist \
        --clean \
        --external jsdom \
        --external cheerio \
        --external @modelcontextprotocol/sdk/client/index.js \
        --external @modelcontextprotocol/sdk/inMemory.js \
        --external @modelcontextprotocol/sdk/server/mcp.js \
        --shims

# Pack runtime-critical plugin packages as tarballs so the worker image does not
# rely on file: symlinks that can break across stages.
RUN cd packages/plugin-policy && npm pack --pack-destination /build/
RUN cd packages/plugin-executor && npm pack --pack-destination /build/
RUN cd packages/agent-bridge && npm pack --pack-destination /build/
RUN cd packages/agent-routing && npm pack --pack-destination /build/
RUN cd packages/runtime-compat && npm pack --pack-destination /build/
RUN cd packages/hermes-runtime && npm pack --pack-destination /build/

# Build openclaw-runtime + pack as tarball
# packages: 'external' means NO openclaw-core node_modules needed at build time
RUN cd packages/openclaw-runtime && npm install && npm run build && npm pack --pack-destination /build/

# Copy worker package files
COPY worker/package.json worker/package-lock.json ./worker/

# Install worker deps, then replace runtime-critical local packages with tarballs.
# Tarballs produce real files in node_modules instead of cross-stage symlinks.
# All @lucid-fdn/* packages are local workspace deps — no registry auth needed
RUN cd worker && \
    npm ci --legacy-peer-deps --ignore-scripts --cache /tmp/npm-cache-worker-ci && \
    npm rebuild bigint-buffer --legacy-peer-deps --cache /tmp/npm-cache-worker-rebuild && \
    rm -rf node_modules/@lucid/openclaw-runtime node_modules/@lucid/hermes-runtime node_modules/@lucid/runtime-compat node_modules/@lucid/agent-bridge node_modules/@lucid/agent-routing node_modules/@lucid/plugin-policy node_modules/@lucid/plugin-executor && \
    rm -rf /tmp/npm-cache-worker-tarballs && \
    npm install /build/lucid-agent-bridge-*.tgz /build/lucid-agent-routing-*.tgz /build/lucid-openclaw-runtime-*.tgz /build/lucid-hermes-runtime-*.tgz /build/lucid-runtime-compat-*.tgz /build/lucid-plugin-policy-*.tgz /build/lucid-plugin-executor-*.tgz --legacy-peer-deps --cache /tmp/npm-cache-worker-tarballs --prefer-online && \
    rm -rf node_modules/@lucid-fdn/agent-tools-core node_modules/@lucid-fdn/code-interpreter node_modules/@lucid-fdn/content node_modules/@lucid-fdn/plugins-embedded node_modules/@lucid-fdn/web3-operator node_modules/@lucid-fdn/web3-types node_modules/@lucid/integration-auth && \
    mkdir -p node_modules/@lucid-fdn node_modules/@lucid && \
    cp -R ../packages/agent-tools-core node_modules/@lucid-fdn/agent-tools-core && \
    cp -R ../packages/code-interpreter node_modules/@lucid-fdn/code-interpreter && \
    cp -R ../packages/content node_modules/@lucid-fdn/content && \
    cp -R ../packages/embedded node_modules/@lucid-fdn/plugins-embedded && \
    cp -R ../packages/web3-operator node_modules/@lucid-fdn/web3-operator && \
    cp -R ../packages/web3-types node_modules/@lucid-fdn/web3-types && \
    cp -R ../packages/integration-auth node_modules/@lucid/integration-auth && \
    rm -rf /tmp/npm-cache-worker-ci /tmp/npm-cache-worker-rebuild /tmp/npm-cache-worker-tarballs

# Verify critical deps resolve
RUN cd worker && node --input-type=module -e "\
  Promise.all([\
    import('lru-cache'),\
    import('@lucid-fdn/agent-tools-core'),\
    import('@lucid-fdn/code-interpreter'),\
    import('@lucid-fdn/content'),\
    import('@lucid-fdn/plugins-embedded'),\
    import('@lucid-fdn/web3-operator'),\
    import('@lucid-fdn/web3-types'),\
    import('@lucid/agent-bridge'),\
    import('@lucid/agent-routing'),\
    import('@lucid/integration-auth'),\
    import('@lucid/openclaw-runtime'),\
    import('@lucid/hermes-runtime'),\
    import('@lucid/runtime-compat'),\
    import('@lucid/plugin-policy'),\
    import('@lucid/plugin-executor'),\
  ]).then(() => console.log('deps OK: workspace packages, runtimes, plugin packages'))"

# Copy worker source + build
COPY worker/tsconfig.json ./worker/
COPY worker/src/ ./worker/src/
RUN cd worker && \
    npm run build && \
    mkdir -p dist/agent/skills && \
    cp -R src/agent/skills/integrations dist/agent/skills/integrations

# The Next.js control plane is built from Dockerfile.web. Keep this image
# worker-only so split Railway services do not spend minutes compiling the app
# or time out while deploying channels/browser/automation workers.

# ══════════════════════════════════════════════
# Runner — minimal production image
# ══════════════════════════════════════════════
FROM node:22-slim
WORKDIR /app

# Hermes CLI is required at runtime for HermesEngineRunner. Install it in the
# final image so dedicated Hermes deployments can spawn `hermes` successfully.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/hermes \
  && /opt/hermes/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/hermes/bin/pip install --no-cache-dir git+https://github.com/NousResearch/hermes-agent.git \
  && ln -sf /opt/hermes/bin/hermes /usr/local/bin/hermes \
  && chmod -R a+rX /opt/hermes \
  && chmod 755 /usr/local/bin/hermes
ENV PATH="/usr/local/bin:/opt/hermes/bin:${PATH}"
ENV HERMES_BIN_PATH=/usr/local/bin/hermes
ENV NANGO_ACTIONS_DIR=/app/nango-actions
RUN which hermes && hermes --version

# Copy compiled worker + deps with final ownership already set so we avoid
# a costly recursive chown over the whole app tree.
COPY --chown=node:node --from=builder /build/worker/package.json ./package.json
COPY --chown=node:node --from=builder /build/worker/dist ./dist
COPY --chown=node:node --from=builder /build/worker/node_modules ./node_modules

# Copy built local packages where npm's workspace links expect them.
# npm materializes local workspace deps as symlinks like:
#   node_modules/@lucid-fdn/content -> ../../packages/content
# so the final image must provide /app/packages/*
COPY --chown=node:node --from=builder /build/packages/ ./packages/

# Bundle compiled Nango action scripts for in-process execution
COPY --chown=node:node nango-integrations/build/*.cjs ./nango-actions/

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium \
  && chmod -R a+rX /ms-playwright

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8080') + '/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
EXPOSE 8080

# No tsx. No NODE_PATH. No symlinks. Just node.
CMD ["node", "dist/railway-entrypoint.js"]
