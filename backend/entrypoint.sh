#!/bin/sh
set -e

# dburl prints DATABASE_URL as given, or the escaped URL built from POSTGRES_*.
MIGRATE_URL="$(./dburl -sslmode=disable)"
migrate -path ./migrations -database "${MIGRATE_URL}" up

exec ./server
