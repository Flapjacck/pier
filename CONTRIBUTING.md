# Contributing to Pier

## Commit convention

Commits should follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): summary (#<issue-number>)

Optional body explaining the change.
```

### Types

- **feat** — new feature
- **fix** — bug fix
- **docs** — documentation only
- **test** — test additions or fixes
- **chore** — tooling, dependencies, refactoring (no feature or bug fix)
- **refactor** — code refactoring with no functional change

### Examples

```
feat(k8s): add pier-apps namespace (#2)

Build namespace with Pod Security labels.
Refs #2
```

```
docs: update deployment README (#37)

Clarify token rotation and manifest apply order.
Refs #37
```

**Rules:**
- Each commit should be **one logical change** and should build/test successfully on its own.
- Use `Refs #<number>` in commit bodies (never `Closes` — only PR bodies use `Closes`).
- The full feature or fix may span multiple commits.
- Never push directly to `main`; all changes go through pull requests.

## Branch naming

Work on features and fixes should use `issue-<number>` pattern:

```
issue-<number>
```

Examples:
- `issue-37`
- `issue-50`
- `issue-42`

## Workflow

1. **Create a branch** from `main`:
   ```bash
   git pull origin main
   git switch -c issue-<number>
   ```

2. **Make your changes**, following the patterns in existing code. Commits should be conventional-style and build successfully.

3. **Run local checks** before pushing:
   ```bash
   pnpm --dir backend lint && pnpm --dir backend typecheck && pnpm --dir backend test && pnpm --dir backend build
   pnpm --dir frontend lint && pnpm --dir frontend typecheck && pnpm --dir frontend test && pnpm --dir frontend build
   pnpm --dir backend audit --prod --audit-level high && pnpm --dir frontend audit --prod --audit-level high
   shellcheck -x backend/scripts/*.sh backend/scripts/lib/*.sh   # if you touched backend/scripts
   ./backend/scripts/deploy-local.sh --render                      # if you touched backend/k8s or scripts; offline
   docker build -f backend/Dockerfile -t pier-backend:ci .         # if you touched a Dockerfile, package files or tsconfigs
   ```

4. **Push your branch** and create a pull request against `main`:
   ```bash
   git push origin HEAD
   gh pr create --base main
   ```

5. **CI must pass** (GitHub Actions workflow: `backend`, `frontend` and `image` jobs all green). The `backend` and `frontend` jobs run install, `pnpm audit --prod --audit-level high`, lint, typecheck, test and build; the backend job also runs `bash -n` and `shellcheck` on `backend/scripts/`. The `image` job builds `backend/Dockerfile` from the repo root exactly like `deploy-local.sh` does (never pushed), so a Dockerfile that can't build fails the PR instead of the deploy. Actions are pinned to full commit SHAs. Dependabot (`.github/dependabot.yml`) opens weekly PRs for the actions, the npm dependencies of `backend/` and `frontend/` (minor and patch grouped, majors separate, `chore(deps)` commits), and the digest-pinned Node base image in `backend/Dockerfile`. Don't switch a pin back to a tag.

6. **No direct pushes to `main`** — all changes go through pull requests. The `main` branch is protected.

## Code style

- **Backend**: ESLint + TypeScript (strict mode). Fix all lint findings; use `// eslint-disable-next-line <rule> -- reason` only when justified.
- **Frontend**: ESLint + React Hooks plugin + TypeScript (strict mode). Same rules apply.
- **File size**: Aim for files ≤ 250 lines; split large files into focused modules.
- **No `any` types** in TypeScript — always write proper types.

See backend's `README.md` for setup details.

## Closing issues

Include **only in the PR body**, not in commit messages:

```
Closes #9
```

This auto-closes the issue when the PR is merged.

## Testing and verification

- The backend needs Node ≥ 22.13 (it uses the built-in `node:sqlite`); CI and the image run Node 26.
- Backend tests run via `node:test` and require no external cluster or `.env`. `tests/scripts/` runs the deploy scripts against shim `kubectl`/`docker`/`ssh` binaries (the real `kubectl` is only used for offline subcommands; those tests skip if it isn't installed).
- Frontend tests run via Vitest in jsdom with mock `fetch` and `EventSource`. See [frontend/README.md](./frontend/README.md#tests) for details.
- All CI checks must pass before merge.

## Branch protection

The `main` branch is protected by a ruleset that enforces:

- Fast-forward-only merges (no merge commits allowed)
- Pull request required (even for solo contributor)
- **Status checks required**: the `backend`, `frontend` and `image` CI jobs must be green
- Branch deletion prevented
- Force push prevented

Once your PR is open and all CI jobs pass, you can merge your own PR.
