# Build stage for frontend: compile React + Vite output.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS web
WORKDIR /app
RUN npm install -g pnpm@12.16.1
COPY pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY frontend/tsconfig.json frontend/vite.config.ts ./frontend/
RUN pnpm --dir frontend install
COPY frontend ./frontend
RUN pnpm --dir frontend build

# Build stage: compile TypeScript backend and prune to production dependencies.
# Pinned to digest for reproducibility; update by running:
#   docker pull node:22-alpine && docker inspect --format '{{index .RepoDigests 0}}' node:22-alpine
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
RUN npm install -g pnpm@12.16.1
COPY pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY backend/tsconfig.json ./backend/
RUN pnpm --dir backend install --ignore-scripts
COPY backend ./backend
RUN pnpm --dir backend build && pnpm --dir backend prune --prod

# Runtime stage: copy only built artifacts and pruned deps, no network access.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
WORKDIR /app
ENV NODE_ENV=production
# Copy pruned production dependencies (no pnpm install in runtime).
COPY --chown=node:node --from=build /app/backend/node_modules ./node_modules
# Copy compiled backend output.
COPY --chown=node:node --from=build /app/backend/dist ./dist
# Copy frontend dist to public.
COPY --chown=node:node --from=web /app/frontend/dist ./public
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
