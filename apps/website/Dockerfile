# Build from the repository root: docker build -f apps/website/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/website/package.json ./apps/website/package.json
RUN pnpm install --frozen-lockfile
COPY apps/website ./apps/website
ARG DEPLOYMENT_VERSION
ENV DEPLOYMENT_VERSION=${DEPLOYMENT_VERSION}
RUN pnpm build

# Build separately with --target migration; run once before a release rollout.
FROM build AS migration
WORKDIR /app/apps/website
USER node
CMD ["./node_modules/.bin/tsx", "src/server/db/migrate.mts"]

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/website/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/website/.next/static ./apps/website/.next/static
COPY --from=build --chown=node:node /app/apps/website/public ./apps/website/public
USER node
EXPOSE 3000
CMD ["node", "apps/website/server.js"]
