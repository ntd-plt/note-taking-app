package main

import (
	"net/url"
	"testing"

	"backend/internal/configs"
)

func TestMigrateURL(t *testing.T) {
	parts := &configs.Config{DBUser: "app", DBPass: "p@ss/w:rd#?%", DBHost: "localhost", DBPort: "5432", DBName: "notes"}
	got, err := migrateURL(parts, "disable")
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	pass, _ := u.User.Password()
	if pass != "p@ss/w:rd#?%" || u.Host != "localhost:5432" || u.Path != "/notes" || u.Query().Get("sslmode") != "disable" {
		t.Errorf("got %q", got)
	}

	provider := &configs.Config{DatabaseURL: "postgres://u:p@render.example:5432/db?sslmode=require"}
	if got, _ := migrateURL(provider, "disable"); got != provider.DatabaseURL {
		t.Errorf("DATABASE_URL changed to %q", got)
	}
	if got, _ := migrateURL(parts, ""); got != parts.DSN() {
		t.Errorf("without sslmode: got %q, want the plain DSN", got)
	}
}
