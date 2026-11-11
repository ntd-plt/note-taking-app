package database_test

import (
	"context"
	"net"
	"os"
	"strings"
	"testing"
	"time"

	"backend/internal/database"
)

// closedPort returns a local port nothing listens on.
func closedPort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	_ = l.Close()
	return addr
}

func TestNewPoolFailsFastWithoutLeakingThePassword(t *testing.T) {
	dsn := "postgres://app:s3cr3t-p%40ss@" + closedPort(t) + "/notes?connect_timeout=2"
	start := time.Now()
	pool, err := database.NewPool(context.Background(), dsn)
	if err == nil {
		pool.Close()
		t.Fatal("want an error for a database nobody listens on")
	}
	if elapsed := time.Since(start); elapsed > 6*time.Second {
		t.Errorf("took %v to fail, want under the connect timeout", elapsed)
	}
	if msg := err.Error(); strings.Contains(msg, "s3cr3t") || !strings.Contains(msg, "/notes") {
		t.Errorf("error = %q: want the database named and the password left out", msg)
	}
}

func TestNewPoolRejectsAMalformedURL(t *testing.T) {
	_, err := database.NewPool(context.Background(), "postgres://app:s3cr3t@[bad")
	if err == nil {
		t.Fatal("want an error")
	}
	if strings.Contains(err.Error(), "s3cr3t") {
		t.Errorf("error leaks the password: %q", err)
	}
}

func TestNewPoolConnects(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping Postgres integration test")
	}
	pool, err := database.NewPool(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	pool.Close()
}
