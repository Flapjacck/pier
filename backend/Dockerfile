# Build stage for frontend: compile React + Vite output.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS web
WORKDIR /app
RUN corepack enable pnpm
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile
COPY frontend/tsconfig.json frontend/vite.config.ts ./frontend/
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public
RUN cd frontend && pnpm build

# Build stage: compile TypeScript backend and prune to production dependencies.
# Pinned to digest for reproducibility; update by running:
#   docker pull node:22-alpine && docker inspect --format '{{index .RepoDigests 0}}' node:22-alpine
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
RUN corepack enable pnpm
COPY backend/package.json backend/pnpm-lock.yaml ./backend/
COPY backend/pnpm-workspace.yaml ./backend/
RUN cd backend && pnpm install --frozen-lockfile
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
RUN cd backend && pnpm run build && pnpm prune --prod

# Runtime stage: copy only built artifacts and pruned deps, no network access.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
WORKDIR /app
ENV NODE_ENV=production
ENV PIER_PUBLIC_DIR=/app/public
# Copy package metadata and pruned production dependencies.
COPY --chown=node:node backend/package.json ./
COPY --chown=node:node backend/node_modules ./node_modules
# Copy compiled backend output.
COPY --chown=node:node backend/dist ./dist
# Copy frontend dist to public.
COPY --chown=node:node --from=web /app/frontend/dist ./public
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
