#!/bin/sh
set -e

# Prefer a full DATABASE_URL (hosting providers give one, already escaped). The
# fallback is built from the POSTGRES_* parts as given, so a password used there
# must not contain URL characters such as @ / : ? # or %; the server itself
# escapes the parts, but this shell line cannot.
if [ -n "${DATABASE_URL}" ]; then
  MIGRATE_URL="${DATABASE_URL}"
else
  MIGRATE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?sslmode=disable"
fi

migrate -path ./migrations -database "${MIGRATE_URL}" up

exec ./server
