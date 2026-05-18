FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 \
  && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN uv tool install hermes-agent

WORKDIR /app

COPY packages/agent-bridge ./packages/agent-bridge
COPY packages/hermes-runtime ./packages/hermes-runtime

RUN cd packages/agent-bridge && npm install && npm run build
RUN cd packages/hermes-runtime && npm install && npm run build

CMD ["node", "packages/hermes-runtime/dist/index.js"]
