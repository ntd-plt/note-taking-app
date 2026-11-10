package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// connectTimeout bounds the connection check at startup, so a wrong host fails
// fast instead of hanging.
const connectTimeout = 5 * time.Second

// NewPool creates the single shared connection pool used by all Postgres data
// sources, then checks that the database answers, so a wrong host, port or
// password stops the server at startup rather than at the first request. Errors
// name the host and database, never the password.
func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		// pgx leaves the password out of parse errors.
		return nil, fmt.Errorf("reading the database URL: %w", err)
	}
	where := fmt.Sprintf("%s:%d/%s as %s", cfg.ConnConfig.Host, cfg.ConnConfig.Port, cfg.ConnConfig.Database, cfg.ConnConfig.User)

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connecting to the database at %s: %w", where, err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connecting to the database at %s: %w", where, err)
	}
	return pool, nil
}
