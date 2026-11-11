package database

// Postgres SQLSTATE codes the datasources translate into apperr errors.
const (
	pgForeignKeyViolation = "23503"
	pgUniqueViolation     = "23505"
	pgCheckViolation      = "23514"
)
