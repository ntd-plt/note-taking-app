# Note-Taking App — Backend

Go + Gin REST API with PostgreSQL storage and JWT authentication.

## Prerequisites

- **Go** 1.26 or newer
- **PostgreSQL** (any recent version; 14+ recommended)

## Setup

All commands below are run from the `backend/` directory.

### 1. Start PostgreSQL

On Arch/systemd:

```bash
sudo systemctl start postgresql
```

(First-time Postgres installs may need `sudo -u postgres initdb -D /var/lib/postgres/data` before the service will start.)

### 2. Create the database

```bash
sudo -u postgres psql -c "CREATE DATABASE notes_app;"
```

If you want a dedicated role instead of using `postgres`:

```bash
sudo -u postgres psql -c "CREATE USER notes_user WITH PASSWORD 'choose_a_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE notes_app TO notes_user;"
sudo -u postgres psql -d notes_app -c "GRANT ALL ON SCHEMA public TO notes_user;"
```

### 3. Configure environment

```bash
cp .env-template .env
```

Then edit `.env` and fill in the values. Generate a strong JWT secret with:

```bash
openssl rand -base64 48
```

| Key | Meaning | Example |
|---|---|---|
| `DB_HOST` | Postgres host | `localhost` |
| `DB_PORT` | Postgres port | `5432` |
| `DB_USER` | Database role | `notes_user` |
| `DB_PASS` | Role password | — |
| `DB_NAME` | Database name | `notes_app` |
| `SERVER_PORT` | HTTP port for the API | `8080` |
| `JWT_SECRET` | Token signing secret (keep private) | output of `openssl rand` |

`.env` is gitignored — never commit it.

### 4. Apply migrations

```bash
psql "postgres://notes_user:<password>@localhost:5432/notes_app" -f migrations/001_create_users.up.sql
```

This creates the `users`, `folders`, and `notes` tables. To undo, run the matching `*.down.sql` file.

## Run

```bash
go run ./cmd/server
```

The API listens on `http://localhost:8080`.

> Note: the port is currently hardcoded to `:8080` in `cmd/server/main.go`; changing `SERVER_PORT` in `.env` has no effect yet.

## API overview

Public endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create an account |
| POST | `/auth/login` | Log in, returns JWT tokens |
| POST | `/auth/refresh-token` | Exchange refresh token for a new access token |

Protected endpoints (require `Authorization: Bearer <access token>`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notes` | List notes |
| POST | `/api/notes` | Create a note |
| GET | `/api/notes/:id` | Get a note |
| PUT | `/api/notes/:id` | Update a note |
| DELETE | `/api/notes/:id` | Delete a note |
| GET | `/api/folders` | List folders |
| POST | `/api/folders` | Create a folder |
| GET | `/api/folders/:id` | Get a folder |
| PUT | `/api/folders/:id` | Update a folder |
| DELETE | `/api/folders/:id` | Delete a folder |

Quick smoke test once the server is up:

```bash
curl -s -X POST http://localhost:8080/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@example.com","password":"secret123"}'
```

## Project layout

```
backend/
├── cmd/server/          # entrypoint (main.go) and route definitions (router.go)
├── internal/
│   ├── configs/         # .env loading
│   ├── database/        # Postgres access (pgx)
│   ├── handlers/        # HTTP handlers (auth, notes, folders)
│   ├── middleware/      # JWT auth middleware
│   ├── model/           # domain types (User, Note, Folder)
│   ├── pkg/hash/        # bcrypt password hashing
│   └── services/        # auth + JWT services
└── migrations/          # SQL schema migrations (*.up.sql / *.down.sql)
```
