FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config packages/config
COPY apps/api apps/api
COPY packages/shared packages/shared

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN pnpm config set fetch-retries 5 \
 && pnpm config set fetch-retry-factor 2 \
 && pnpm config set fetch-retry-mintimeout 10000 \
 && pnpm config set fetch-retry-maxtimeout 120000 \
 && pnpm config set network-timeout 600000
RUN pnpm install --frozen-lockfile --prefer-offline --filter ./apps/api... --filter ./packages/shared...
RUN pnpm -C /app/packages/shared build
RUN pnpm -C /app/apps/api db:generate

ENV NODE_OPTIONS=--max-old-space-size=1024

WORKDIR /app/apps/api
RUN pnpm build

EXPOSE 4000
CMD ["pnpm", "start"]
