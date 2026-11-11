# Backend Makefile — setup, migrations, docs, run.
# All commands assume they're run from the backend/ directory ($ cd backend && make ...).
#
# POSTGRES_* are NOT loaded as Make variables (a plain `-include .env`
# freezes them at parse time, before `env` has a chance to create the file on
# a fresh clone). Instead, any recipe that needs them sources .env itself at
# run time via `. ./.env`, after `env` (its prerequisite) has guaranteed the
# file exists.

GOBIN          := $(shell go env GOPATH)/bin
BINARY         := bin/server
MIGRATIONS_DIR := migrations

.PHONY: help setup env tools tidy db-create db-drop \
        migrate-up migrate-down migrate-create seed-user db-reset \
        swagger build run test vet fmt clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*## ' Makefile | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## --- Setup -----------------------------------------------------------------

setup: env tools tidy db-create migrate-up seed-user ## One-shot setup: env file, tools, deps, database, migrations, dev user — no manual steps required
	@echo "Setup complete. Run 'make run' to start the server."

env: ## Create .env from .env.example if missing
	@test -f .env || cp .env.example .env

tools: ## Install swag (Swagger generator) and migrate (schema migrations) CLIs
	go install github.com/swaggo/swag/cmd/swag@v1.16.6
	go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.20.1

tidy: ## Download and tidy Go module dependencies
	go mod download
	go mod tidy

## --- Database ---------------------------------------------------------------

db-create: env ## Create the Postgres database named in .env (POSTGRES_DB), no-op if it exists
	@. ./.env; PGPASSWORD=$$POSTGRES_PASSWORD psql -h $$POSTGRES_HOST -p $$POSTGRES_PORT -U $$POSTGRES_USER -d postgres -c "CREATE DATABASE $$POSTGRES_DB;" 2>/dev/null || echo "Database '$$POSTGRES_DB' already exists or could not be created — continuing."

db-drop: env ## Drop the Postgres database named in .env (POSTGRES_DB), terminating other sessions first
	@. ./.env; PGPASSWORD=$$POSTGRES_PASSWORD psql -h $$POSTGRES_HOST -p $$POSTGRES_PORT -U $$POSTGRES_USER -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$$POSTGRES_DB' AND pid <> pg_backend_pid();" >/dev/null
	@. ./.env; PGPASSWORD=$$POSTGRES_PASSWORD psql -h $$POSTGRES_HOST -p $$POSTGRES_PORT -U $$POSTGRES_USER -d postgres -c "DROP DATABASE IF EXISTS $$POSTGRES_DB;"

migrate-up: env ## Apply all pending SQL migrations
	@URL=$$(go run ./cmd/dburl -sslmode=disable) && $(GOBIN)/migrate -path $(MIGRATIONS_DIR) -database "$$URL" up

migrate-down: env ## Roll back the most recent migration
	@URL=$$(go run ./cmd/dburl -sslmode=disable) && $(GOBIN)/migrate -path $(MIGRATIONS_DIR) -database "$$URL" down 1

migrate-create: ## Create a new migration pair: make migrate-create name=add_something
	@test -n "$(name)" || (echo "usage: make migrate-create name=<migration_name>"; exit 1)
	$(GOBIN)/migrate create -ext sql -dir $(MIGRATIONS_DIR) -seq $(name)

seed-user: env ## Create the dev user from SEED_USER_EMAIL / SEED_USER_PASSWORD / SEED_USER_NAME in .env (skips if unset or already there)
	go run ./cmd/seeduser

db-reset: db-drop db-create migrate-up seed-user ## Drop and recreate the database, apply migrations, then create the dev user again

## --- Docs ---------------------------------------------------------------

swagger: ## Regenerate Swagger/OpenAPI docs from handler annotations
	$(GOBIN)/swag init -g cmd/server/main.go --output docs --parseDependency --parseInternal

## --- Build & run --------------------------------------------------------

build: ## Build the server binary into bin/server
	go build -o $(BINARY) ./cmd/server

run: ## Run the server (go run, no build artifact)
	go run ./cmd/server

test: ## Run the test suite
	go test ./...

vet: ## Run go vet
	go vet ./...

fmt: ## Format all Go source files
	gofmt -l -w .

clean: ## Remove build artifacts
	rm -rf bin
