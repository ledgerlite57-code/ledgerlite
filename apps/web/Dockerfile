FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config packages/config
COPY apps/web apps/web
COPY packages/shared packages/shared

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN pnpm install --filter ./apps/web... --filter ./packages/shared...
RUN pnpm -C /app/packages/shared build

WORKDIR /app/apps/web
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
