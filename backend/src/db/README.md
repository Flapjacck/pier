# Database

Pier keeps a small SQLite database for its own records: the audit log and the login rate limiter. It uses Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html) (`DatabaseSync`), so there is no native dependency to build and the Docker image stays the same. That needs Node ≥ 22.13, where `node:sqlite` no longer needs a flag. tsup leaves `node:sqlite` external, so `dist/index.js` imports it from the runtime.

Live app state (Deployments, Services, volumes) is **not** stored here. Kubernetes stays the source of truth for that.

| File | Purpose |
|------|---------|
| `open.ts` | `openDatabase(path)`: creates the parent directory, opens the file, sets `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`, then runs migrations. `":memory:"` gives a throwaway DB (tests). |
| `migrations/index.ts` | `Migration` type, the ordered `MIGRATIONS` list and `runMigrations()`. |
| `migrations/001_init.ts` | Tables `audit_log` and `login_attempts` and their indexes. |
| `audit.ts` | `insertAudit`, `listAudit` (newest first, `before` id cursor, optional `app` filter, returns `nextBefore`), `pruneAudit`. |
| `login-limiter.ts` | `SqliteLoginLimiter`: 5 failures per IP within 60s, then `POST /api/login` returns 429; a successful login clears the IP. |
| `maintenance.ts` | `pruneOnce` and `startPruning`: prune at startup and every hour (unref'd timer). |

## Location

`PIER_DB_PATH` sets the file. The default is `./data/pier.db` relative to the working directory (`backend/data/` is gitignored). In the cluster it is `/data/pier.db` on the PVC `pier-backend-data` (see [`../../k8s/README.md`](../../k8s/README.md#pier-backend-data)). WAL mode keeps `pier.db-wal` and `pier.db-shm` next to the file.

`buildApp()` opens the DB unless a test passes `{ db }`, and closes it in `onClose` (only if it opened it), after stopping the prune timer.

## Migrations

Migrations are TypeScript strings, not `.sql` files, so tsup bundles them into `dist/index.js`. On startup `runMigrations()` creates `schema_migrations (version, name, applied_at)` if needed and applies every newer migration in its own `BEGIN IMMEDIATE` transaction together with its `schema_migrations` row. A failure rolls that migration back and stops startup. Running it again is a no-op.

To change the schema, add `migrations/00N_<name>.ts` with the next version and append it to `MIGRATIONS`. Never edit a migration that has shipped.

## Tables

| Table | Columns |
|-------|---------|
| `audit_log` | `id` (autoincrement), `ts` (epoch ms), `actor` (`token` or `session`), `ip`, `action` (e.g. `app.scale`), `app`, `target`, `status`, `details` (JSON object) |
| `deployments` | `id` (autoincrement), `app`, `trigger` (`create`, `patch`, `restart`; `rollback`/`build` reserved), `status` (`running`, `succeeded`, `failed`, `cancelled`), `spec` (JSON: image, port, replicas, host, resources, volumes, env **key names**), `reason`, `generation` (the Deployment generation the change produced), `source_deployment_id` (for #87 rollbacks), `started_at`, `finished_at` (epoch ms) |
| `deployment_steps` | `deployment_id` + `position` (primary key, cascade delete), `name`, `status` (`pending`, `running`, `succeeded`, `failed`, `skipped`), `started_at`, `finished_at` |
| `deployment_logs` | `id`, `deployment_id` (cascade delete), `step`, `ts`, `level` (`info`, `warning`, `error`), `text`, `event_key` (unique per deploy, so a Kubernetes event is written once) |
| `login_attempts` | `ip` (primary key), `count`, `reset_at` (epoch ms) |
| `schema_migrations` | `version`, `name`, `applied_at` |

## Audit log

[`../plugins/audit.ts`](../plugins/audit.ts) records one row per successful (2xx) mutating request in an `onResponse` hook. [`../plugins/audit-routes.ts`](../plugins/audit-routes.ts) maps each `METHOD /api/...` route to an action and the details it may keep. Startup fails with `mutating route X has no audit rule` if a POST, PUT, PATCH or DELETE route is in neither `AUDITED_ROUTES` nor `UNAUDITED_ROUTES`, so a new route can't skip the log by accident.

Details never hold env values, tokens or cookies. For env changes only the key names are kept (`envKeys`), and a PATCH records the field names it changed. A failed DB write is logged as `audit write failed` and never changes the response.

Rows older than `PIER_AUDIT_RETENTION_DAYS` (default 90, 1–3650) are deleted at startup and hourly, together with expired login windows. Read the log with [`GET /api/audit`](../routes/README.md#get-apiaudit).

## Deploy history

Migration `002_deployments` (#81) adds the three `deployment*` tables. The deploy tracker in [`../deploys/`](../deploys/) writes them: [`deployments.ts`](deployments.ts) for writes, [`deployments-read.ts`](deployments-read.ts) for paged reads and [`deployments-prune.ts`](deployments-prune.ts) for retention. Kubernetes stays the source of truth for live app state. These tables only hold what each deploy asked for, its steps and the plain-language lines shown in the dashboard. Env values are never stored, only key names.

Finished deploys are pruned in the same startup and hourly pass as the audit log. Rows older than `PIER_AUDIT_RETENTION_DAYS` are removed, and only the newest 50 finished deploys per app are kept. Running deploys are never pruned. Steps and lines go with their deploy (`ON DELETE CASCADE`). A failed write is logged with the deploy id and never fails the request that started the deploy. Read them with [`GET /api/apps/:name/deployments`](../routes/README.md#deploy-history-81).
