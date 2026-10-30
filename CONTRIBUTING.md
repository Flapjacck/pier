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
fix(auth): correct bearer token validation timing (#5)
docs: clarify kubeconfig requirements in README (#9)
chore(backend): upgrade TypeScript to 5.8 (#9)
```

Each commit should be **one logical change** and should build/test successfully on its own. The full feature or fix may span multiple commits.

## Branch naming

Feature branches should follow this pattern:

```
<type>/<issue-number>-<slug>
```

Examples:
- `feat/2-k8s-namespace`
- `fix/5-auth-timing`
- `chore/9-dx-lint-ci`

## Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git pull origin main
   git switch -c feat/<number>-<slug>
   ```

2. **Make your changes**, following the patterns in existing code. Commits should be conventional-style and build successfully.

3. **Run local checks** before pushing:
   ```bash
   pnpm --dir backend lint && pnpm --dir backend typecheck && pnpm --dir backend test && pnpm --dir backend build
   pnpm --dir frontend lint && pnpm --dir frontend typecheck && pnpm --dir frontend build
   ```

4. **Push your branch** and create a pull request against `main`:
   ```bash
   git push origin HEAD
   gh pr create --base main
   ```

5. **CI must pass** (GitHub Actions workflow: `backend` and `frontend` jobs both green).

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

- Backend tests run via `node:test` and require no external cluster or `.env`.
- Frontend has no automated tests yet; verify manually in the dev server.
- All CI checks must pass before merge.

## Branch protection

The `main` branch is protected by a ruleset that enforces:

- Fast-forward-only merges (no merge commits allowed)
- Pull request required (even for solo contributor)
- **Status checks required**: both `backend` and `frontend` CI jobs must be green
- Branch deletion prevented
- Force push prevented

Once your PR is open and both CI jobs pass, you can merge your own PR.
