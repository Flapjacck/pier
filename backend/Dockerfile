# Build stage for frontend: compile React + Vite output.
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS web
WORKDIR /app
RUN corepack enable pnpm
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile
COPY frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/tsconfig.test.json frontend/vite.config.ts frontend/index.html ./frontend/
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public
RUN cd frontend && pnpm build

# Build stage: compile TypeScript backend and prune to production dependencies.
# Pinned to digest for reproducibility; update by running:
#   docker pull node:22-alpine && docker inspect --format '{{index .RepoDigests 0}}' node:22-alpine
# Must stay on Node 22.13 or later: the backend uses the built-in node:sqlite (#80).
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS build
WORKDIR /app
RUN corepack enable pnpm
COPY backend/package.json backend/pnpm-lock.yaml ./backend/
COPY backend/pnpm-workspace.yaml ./backend/
RUN cd backend && pnpm install --frozen-lockfile
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
RUN cd backend && pnpm run build && pnpm prune --prod

# Runtime stage: copy only built artifacts and pruned deps, no network access.
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216
WORKDIR /app
ENV NODE_ENV=production
ENV PIER_PUBLIC_DIR=/app/public
# git powers POST /api/git/probe (ls-remote and a shallow clone for the wizard's
# branch, folder and volume-hint lists). `git --version` fails the build if it's missing.
RUN apk add --no-cache git \
  && git --version
# Copy package metadata and pruned production dependencies.
COPY --chown=node:node --from=build /app/backend/package.json ./
COPY --chown=node:node --from=build /app/backend/node_modules ./node_modules
# Copy compiled backend output.
COPY --chown=node:node --from=build /app/backend/dist ./dist
# Copy frontend dist to public.
COPY --chown=node:node --from=web /app/frontend/dist ./public
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
