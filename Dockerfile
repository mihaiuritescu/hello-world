# One image serves the SPA, the REST API and the WebSocket.
# Builds for the local architecture: amd64 on most laptops, arm64 on Apple Silicon and Graviton.

FROM node:24.22.2-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:24.22.2-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/server ./src/server
COPY --from=build /app/dist/client ./dist/client
ARG GIT_SHA=dev
ENV APP_VERSION=$GIT_SHA
USER node
EXPOSE 3000
# Exec form, so `docker stop` delivers SIGTERM to Node for a graceful shutdown.
CMD ["node", "src/server/main.ts"]
