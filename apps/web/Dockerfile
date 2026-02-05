FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ARG NEXT_PUBLIC_APP_VERSION=local-dev
ENV NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION}
ARG NEXT_PUBLIC_ENVIRONMENT_LABEL=DEV
ENV NEXT_PUBLIC_ENVIRONMENT_LABEL=${NEXT_PUBLIC_ENVIRONMENT_LABEL}
ARG NEXT_PUBLIC_NON_PROD_SAFETY_BANNER_ENABLED=false
ENV NEXT_PUBLIC_NON_PROD_SAFETY_BANNER_ENABLED=${NEXT_PUBLIC_NON_PROD_SAFETY_BANNER_ENABLED}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config packages/config
COPY apps/web apps/web
COPY packages/shared packages/shared

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN pnpm config set fetch-retries 5 \
 && pnpm config set fetch-retry-factor 2 \
 && pnpm config set fetch-retry-mintimeout 10000 \
 && pnpm config set fetch-retry-maxtimeout 120000 \
 && pnpm config set network-timeout 600000
RUN pnpm install --frozen-lockfile --prefer-offline --filter ./apps/web... --filter ./packages/shared...
RUN pnpm -C /app/packages/shared build

WORKDIR /app/apps/web
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
