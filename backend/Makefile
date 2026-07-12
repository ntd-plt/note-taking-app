# Backend Makefile — setup, migrations, docs, run.
# All commands assume they're run from the backend/ directory ($ cd backend && make ...).
#
# DB_* / JWT_SECRET are NOT loaded as Make variables (a plain `-include .env`
# freezes them at parse time, before `env` has a chance to create the file on
# a fresh clone). Instead, any recipe that needs them sources .env itself at
# run time via `. ./.env`, after `env` (its prerequisite) has guaranteed the
# file exists.

GOBIN          := $(shell go env GOPATH)/bin
BINARY         := bin/server
MIGRATIONS_DIR := migrations

.PHONY: help setup env tools tidy db-create db-drop \
        migrate-up migrate-down migrate-create \
        swagger build run test vet fmt clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*## ' Makefile | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## --- Setup -----------------------------------------------------------------

setup: env tools tidy db-create migrate-up ## One-shot setup: env file (secret auto-generated), tools, deps, database, migrations — no manual steps required
	@echo "Setup complete. Run 'make run' to start the server."

env: ## Create .env from .env-template if missing, auto-generating a JWT secret
	@test -f .env || cp .env-template .env
	@if [ -z "$$(grep '^JWT_SECRET=' .env | cut -d'=' -f2-)" ]; then \
		SECRET=$$(openssl rand -base64 48); \
		sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$$SECRET|" .env; \
		echo "Generated a random JWT_SECRET in .env."; \
	fi

tools: ## Install swag (Swagger generator) and migrate (schema migrations) CLIs
	go install github.com/swaggo/swag/cmd/swag@latest
	go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

tidy: ## Download and tidy Go module dependencies
	go mod download
	go mod tidy

## --- Database ---------------------------------------------------------------

db-create: env ## Create the Postgres database named in .env (DB_NAME), no-op if it exists
	@. ./.env; sudo -u postgres psql -c "CREATE DATABASE $$DB_NAME;" 2>/dev/null || echo "Database '$$DB_NAME' already exists or could not be created — continuing."

db-drop: env ## Drop the Postgres database named in .env (DB_NAME), terminating other sessions first
	@. ./.env; sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null
	@. ./.env; sudo -u postgres psql -c "DROP DATABASE IF EXISTS $$DB_NAME;"

migrate-up: env ## Apply all pending SQL migrations
	@. ./.env; $(GOBIN)/migrate -path $(MIGRATIONS_DIR) -database "postgres://$$DB_USER:$$DB_PASS@$$DB_HOST:$$DB_PORT/$$DB_NAME?sslmode=disable" up

migrate-down: env ## Roll back the most recent migration
	@. ./.env; $(GOBIN)/migrate -path $(MIGRATIONS_DIR) -database "postgres://$$DB_USER:$$DB_PASS@$$DB_HOST:$$DB_PORT/$$DB_NAME?sslmode=disable" down 1

migrate-create: ## Create a new migration pair: make migrate-create name=add_something
	@test -n "$(name)" || (echo "usage: make migrate-create name=<migration_name>"; exit 1)
	$(GOBIN)/migrate create -ext sql -dir $(MIGRATIONS_DIR) -seq $(name)

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
