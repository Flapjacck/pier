# Build stage: compile TypeScript and prune to production dependencies.
# Pinned to digest for reproducibility; update by running:
#   docker pull node:22-alpine && docker inspect --format '{{index .RepoDigests 0}}' node:22-alpine
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

# Runtime stage: copy only built artifacts and pruned deps, no network access.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
WORKDIR /app
ENV NODE_ENV=production
# Copy package metadata and pruned production dependencies (no pnpm install in runtime).
COPY --chown=node:node --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
# Copy compiled output.
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
