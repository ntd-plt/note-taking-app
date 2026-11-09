package configs

import (
	"testing"
	"time"
)

func TestLoadTrashRetention(t *testing.T) {
	cases := []struct {
		name    string
		env     string
		want    time.Duration
		wantErr bool
	}{
		{"unset uses 30 days", "", 30 * 24 * time.Hour, false},
		{"hours", "48h", 48 * time.Hour, false},
		{"short, for testing", "5s", 5 * time.Second, false},
		{"not a duration", "30", 0, true},
		{"zero", "0s", 0, true},
		{"negative", "-1h", 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("TRASH_RETENTION", tc.env)
			cfg, err := Load()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("Load() = %+v, want an error", cfg)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if cfg.TrashRetention != tc.want {
				t.Errorf("TrashRetention = %v, want %v", cfg.TrashRetention, tc.want)
			}
		})
	}
}

func TestLoadSessionTTLs(t *testing.T) {
	t.Setenv("SESSION_IDLE_TTL", "")
	t.Setenv("SESSION_ABSOLUTE_TTL", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.SessionIdleTTL != 7*24*time.Hour || cfg.SessionAbsoluteTTL != 30*24*time.Hour {
		t.Errorf("defaults = %v / %v, want 7 days / 30 days", cfg.SessionIdleTTL, cfg.SessionAbsoluteTTL)
	}

	t.Setenv("SESSION_IDLE_TTL", "1h")
	t.Setenv("SESSION_ABSOLUTE_TTL", "24h")
	if cfg, err = Load(); err != nil {
		t.Fatal(err)
	}
	if cfg.SessionIdleTTL != time.Hour || cfg.SessionAbsoluteTTL != 24*time.Hour {
		t.Errorf("got %v / %v, want 1h / 24h", cfg.SessionIdleTTL, cfg.SessionAbsoluteTTL)
	}

	for _, name := range []string{"SESSION_IDLE_TTL", "SESSION_ABSOLUTE_TTL"} {
		t.Run(name, func(t *testing.T) {
			t.Setenv(name, "7d")
			if _, err := Load(); err == nil {
				t.Errorf("%s=7d: want an error", name)
			}
		})
	}
}

func TestLoadAllowedOrigins(t *testing.T) {
	cases := map[string][]string{
		"":                  nil,
		"https://a.example": {"https://a.example"},
		" https://a.example , ,http://localhost:3000 ": {"https://a.example", "http://localhost:3000"},
	}
	for raw, want := range cases {
		t.Setenv("ALLOWED_ORIGINS", raw)
		cfg, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		if len(cfg.AllowedOrigins) != len(want) {
			t.Errorf("%q: got %q, want %q", raw, cfg.AllowedOrigins, want)
			continue
		}
		for i := range want {
			if cfg.AllowedOrigins[i] != want[i] {
				t.Errorf("%q: got %q, want %q", raw, cfg.AllowedOrigins, want)
			}
		}
	}
}

func TestLoadRejectsAWildcardOrigin(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://a.example,*")
	if _, err := Load(); err == nil {
		t.Error(`ALLOWED_ORIGINS with "*": want an error`)
	}
}

func TestSecureCookiesOutsideDevelopment(t *testing.T) {
	for env, want := range map[string]bool{"development": false, "staging": true, "production": true} {
		if got := (&Config{AppEnv: env}).SecureCookies(); got != want {
			t.Errorf("APP_ENV=%s: SecureCookies = %v, want %v", env, got, want)
		}
	}
}
