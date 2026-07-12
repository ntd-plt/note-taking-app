package testutil

import (
	"os"
	"path/filepath"
	"testing"
)

// SetupJWTEnv makes configs.Load() work in tests: it writes a .env file with
// the given JWT secret into a temp dir, chdirs into it for the duration of
// the test, and sets JWT_SECRET so the value wins even if the process
// environment already has one.
func SetupJWTEnv(t *testing.T, secret string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("JWT_SECRET="+secret+"\n"), 0o600); err != nil {
		t.Fatalf("writing .env: %v", err)
	}
	t.Chdir(dir)
	t.Setenv("JWT_SECRET", secret)
}
