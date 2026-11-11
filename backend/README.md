# Note-Taking App — Backend

Go + Gin REST API with PostgreSQL storage and cookie-based session authentication.

## Prerequisites

- **Go** 1.26+
- **PostgreSQL** running locally (14+ recommended)
- `sudo` access to your local Postgres install (used by `make db-create`/`db-drop`, matching a default Arch/systemd-style local install — see Troubleshooting if your setup differs)

All commands below are run from this directory (`backend/`).

## Quick start

```bash
make setup   # env file + tools + deps + database + migrations
make run     # starts the API on :8080
```

No manual editing required — `make setup` creates `.env` from `.env.example` and runs the rest of the setup against it in one shot. It's idempotent — safe to re-run; it won't overwrite an existing `.env`.

The `.env.example` defaults (`POSTGRES_HOST=localhost`, `POSTGRES_USER=postgres`, empty `POSTGRES_PASSWORD`, `POSTGRES_DB=notes_app`) assume a local Postgres reachable via peer/trust auth, matching a fresh Arch/systemd-style install. If your Postgres setup differs, edit `.env` before running `make setup` (or re-run `make db-create migrate-up` after editing).

| Key                 | Meaning                                                                      | Example                      |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| `DATABASE_URL`      | Full Postgres connection URL. When set it wins over the `POSTGRES_*` parts (hosting providers such as Render give one) | `postgres://user:pass@host:5432/db` |
| `POSTGRES_HOST`     | Postgres host                                                                | `localhost`                  |
| `POSTGRES_PORT`     | Postgres port                                                                | `5432`                       |
| `POSTGRES_USER`     | Database role                                                                | `postgres`                   |
| `POSTGRES_PASSWORD` | Role password. Any characters work: the server, `make migrate-*` and the Docker entrypoint all build the URL with `cmd/dburl`, which escapes the parts | —                            |
| `POSTGRES_DB`       | Database name                                                                | `notes_app`                  |
| `PORT`              | HTTP port for the API. Hosting providers such as Render set it themselves     | `8080`                       |
| `APP_ENV`           | `development` (default), `staging` or `production` — Swagger UI is served only in `development` | `development`                |
| `ALLOWED_ORIGINS`   | Comma-separated browser origins allowed to call the API cross-origin with the session cookie. Leave empty when the frontend reaches the API through a proxy under its own domain (dev server, Docker nginx, Vercel rewrite). `*` is refused | `http://localhost:3000` |
| `SESSION_IDLE_TTL`  | A session ends after this long without use (Go duration)                     | `168h` (7 days)              |
| `SESSION_ABSOLUTE_TTL` | A session ends this long after login, however much it is used (Go duration) | `720h` (30 days)             |
| `TRASH_RETENTION`   | How long a page stays in the trash, as a Go duration (`720h`, `30s` for testing). Expired pages are hidden from `GET /trash` and deleted the next time that user moves something to the trash; there is no background job | `720h` (30 days)             |
| `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `SEED_USER_NAME` | Dev user created by `make seed-user` (see below); leave empty to skip | —                            |

`.env` is gitignored — never commit it.

### Dev user and sample pages

Fill in `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` and `SEED_USER_NAME` in your `.env` (an existing `.env` is not updated from `.env.example`, so add the three lines yourself). Then:

```bash
make seed-user   # create that user plus a sample workspace of pages and blocks (skipped if the user already has pages)
make db-reset    # drop and recreate the database, migrate, then seed-user — use after wiping the database
```

The sample tree is `cmd/seeduser/sample_tree.json`: pages that use every block type, with child pages under pages and under blocks. Edit it to change what gets created (the header comment in `sample_tree.go` describes the format; it goes through the same rules as `POST /ops`, so a mistake in it stops the command before anything is created). `make setup` also runs `seed-user`. Nothing is created when any of the three values is empty, and it refuses to run with `APP_ENV=production`. With Docker, the backend container only runs migrations, so after `docker compose down -v` run `make seed-user` against the new database.

## Running the server

```bash
make run     # go run ./cmd/server — no build artifact
# or
make build   # compiles to bin/server
./bin/server
```

The API listens on `http://localhost:8080` (set `PORT` to change it). On SIGINT or SIGTERM it stops taking new requests and gives the ones in flight up to 10 seconds to finish.

Once it's up, interactive API docs are at `http://localhost:8080/swagger/index.html` (`APP_ENV=development` only — see [`docs/SWAGGER.md`](../docs/SWAGGER.md)).

## Troubleshooting

**`make db-create` / `make db-drop` fail or hang on a password prompt.**
These use `sudo -u postgres psql`, matching a default local Postgres install (peer auth for the `postgres` OS/DB role). If your Postgres is configured differently (Docker, remote host, a non-default role), skip these targets, create/drop the database yourself with whatever method matches your setup, then continue with `make migrate-up`.

**Postgres isn't running.**

```bash
sudo systemctl start postgresql
```

First-time installs may need `sudo -u postgres initdb -D /var/lib/postgres/data` before the service will start.

**`make migrate-up` / `make migrate-down` can't connect.**
These build a connection string directly from `POSTGRES_HOST`/`POSTGRES_PORT`/`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` in `.env` (`sslmode=disable`). Confirm those values are correct and that Postgres accepts TCP connections on `POSTGRES_HOST:POSTGRES_PORT` for `POSTGRES_USER` (check `pg_hba.conf` if you get an auth error rather than a connection-refused error).

**`swag`/`migrate` not found even after `make tools`.**
`make tools` installs them to `$(go env GOPATH)/bin`. The Makefile calls them by full path, so `make swagger`/`make migrate-up` work regardless — but if you want to invoke them directly, add that directory to your `PATH`.

**The database still has the old schema (`notes`, `folders`, `note_contents`, or `items` without `child_ids`).**
Migrations `001_create_users` and `003_create_item_tree` were rewritten in place instead of adding new ones, so a database that already ran an older version of them is considered up to date and keeps the old schema. Reset it once: `make db-reset` (local Postgres), or `docker compose down -v` (Docker volume). Any hosted database (e.g. staging) needs the same reset.

## API overview

Everything is served under `/api/v1`.

### Authentication

Login and signup start a server-side session and set its id in the `sid` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` outside `development`). The browser sends it with every later request; there are no tokens to store or refresh. The database keeps only a SHA-256 hash of the id. A session ends after `SESSION_IDLE_TTL` without use, `SESSION_ABSOLUTE_TTL` after login, or at logout.

State-changing requests (anything but GET, HEAD, OPTIONS) that a browser sends from another site are refused with 403, using Go's `http.CrossOriginProtection`; origins in `ALLOWED_ORIGINS` are let through. Non-browser clients such as curl are not affected, but must keep the cookie themselves (`curl -c jar -b jar ...`).

### Request bodies

JSON bodies are read strictly: an unknown field or trailing data gets 400 naming the problem, so a typo never turns into a silently ignored option. When adding a request field, **deploy the backend first, then the frontend**; the other order makes the new field fail with 400 until the backend catches up.

Public endpoints:

| Method | Path                  | Purpose                                                            |
| ------ | --------------------- | ------------------------------------------------------------------ |
| POST   | `/api/v1/auth/signup` | Create an account and log in (sets the cookie); returns the user. Name: trimmed, 1–50 characters; password: 6–72 bytes; email: valid and deliverable |
| POST   | `/api/v1/auth/login`  | Log in (sets the cookie); returns the user. An unknown email and a wrong password get the same 401, after the same work |
| POST   | `/api/v1/auth/logout` | End this session and clear the cookie                              |

Protected endpoints (require a live session cookie, else 401):

| Method | Path                            | Purpose                                                                                     |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/logout-all`       | End every session of the user, on every device                                              |
| GET    | `/api/v1/users/me`              | Get the current user                                                                        |
| PUT    | `/api/v1/users/me`              | Change the current user's name (trimmed, 1–50 characters). The email can't be changed yet: a body with `email` gets 400 |
| GET    | `/api/v1/workspace`             | The user's hidden workspace root; its `child_ids` are the top-level pages                    |
| GET    | `/api/v1/pages`                 | Every page not in the trash, in document order, with `parent_id` and `parent_page_id` (sidebar) |
| GET    | `/api/v1/items/:id`             | Open a page: the page, everything under it as a flat list, and its ancestor pages. For a block id, its page with `focus_id` set |
| POST   | `/api/v1/ops`                   | Apply up to 500 operations in order, all-or-nothing (see below)                             |
| POST   | `/api/v1/items/:id/duplicate`   | Deep-copy a page or block, with new ids, right after the original                           |
| GET    | `/api/v1/trash`                 | Pages in the trash, most recent first, each with `purge_at`                                 |
| POST   | `/api/v1/trash/:id/restore`     | Restore a page to the end of the top level                                                  |
| DELETE | `/api/v1/trash/:id`             | Delete a page in the trash, and everything inside it, for good                              |
| DELETE | `/api/v1/trash`                 | Empty the trash; returns `{"deleted": n}`                                                   |

### The item tree

Everything is an **item**: `id`, `parent_id`, `type`, `child_ids` (ordered children not in the trash), `props` (JSON whose keys depend on the type), `trashed_at`, `created_at`, `updated_at`.

- Each user has one hidden `workspace` item. Pages sit under it, under other pages, or under any block.
- Types: `workspace`, `page`, and the blocks `paragraph`, `heading`, `bulletListItem`, `numberedListItem`, `checkListItem`, `toggleListItem`, `quote` (BlockNote's names).
- Props the server relies on: page `name` (1–255 chars, default "New Page"), `icon` (default 📄), `is_favorite`; heading `level` (1–3, required); checklist `checked`; every block's `content` (BlockNote inline content). Other keys are stored as given. Props are at most 64 KB per item.

### Operations (`POST /api/v1/ops`)

`{"ops": [...]}`, each one of:

| `op`      | Fields                                         | Does                                                                                      |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `create`  | `id`, `type`, `parent_id`, `position?`, `props?` | Creates an item (ids are chosen by the client); missing props get their defaults          |
| `update`  | `id`, `type?`, `props?`                        | Merges props key by key (`null` is ignored); `type` turns a block into another block type |
| `move`    | `id`, `parent_id`, `position?`                 | Moves an item with everything under it                                                    |
| `delete`  | `id`                                           | Deletes a block and everything under it; pages inside it go to the trash                 |
| `trash`   | `id`                                           | Moves a page, with everything in it, to the trash                                         |
| `restore` | `id`, `parent_id?`, `position?`                | Takes a page out of the trash, to `parent_id` at `position` or to the end of the top level |

`position` is an index into the parent's `child_ids` when the operation runs, not counting the item itself; later operations see earlier ones. Without it the item goes at the end, except that a page added to the end of a page goes before that page's trailing empty paragraph. A rejected batch changes nothing and names the failing operation in `op_index`.

Items that belong to another user behave exactly like missing ones (404).

Full request/response shapes are documented via Swagger — see [`docs/SWAGGER.md`](../docs/SWAGGER.md) for how to view and regenerate them.
