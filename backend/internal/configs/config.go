package configs

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPass     string
	DBName     string
	ServerPort string

	JWTSecret string

	// AppEnv is "development" or "production". Defaults to "development"
	// (dev-safe) unless explicitly set otherwise via the APP_ENV env var.
	AppEnv string

	// DisableEmailVerification skips signup email verification (fails open)
	// when set via the DISABLE_EMAIL_VERIFICATION env var.
	DisableEmailVerification bool

	// TrashRetention is how long trashed items are kept before they are purged,
	// set via the TRASH_RETENTION env var as a Go duration (e.g. "720h", "30s").
	TrashRetention time.Duration

	// SessionIdleTTL ends a login session that has not been used for this long
	// (SESSION_IDLE_TTL); SessionAbsoluteTTL ends it this long after login, however
	// much it is used (SESSION_ABSOLUTE_TTL). Both are Go durations.
	SessionIdleTTL     time.Duration
	SessionAbsoluteTTL time.Duration

	// AllowedOrigins are the browser origins, such as "https://app.example.com",
	// that may call the API with the session cookie (ALLOWED_ORIGINS, comma
	// separated). Empty means only same-origin requests.
	AllowedOrigins []string
}

const (
	DefaultTrashRetention     = 30 * 24 * time.Hour
	DefaultSessionIdleTTL     = 7 * 24 * time.Hour
	DefaultSessionAbsoluteTTL = 30 * 24 * time.Hour
)

func Default() *Config {
	return &Config{
		DBHost:     "localhost",
		DBPort:     "5432",
		DBUser:     "postgres",
		DBPass:     "password",
		DBName:     "db",
		ServerPort: "8080",
		JWTSecret:  "default_secret",
		AppEnv:     "development",

		TrashRetention: DefaultTrashRetention,
	}
}

func Load() (*Config, error) {
	// Attempt to load .env file, but do not fail if it is missing (as in production)
	_ = godotenv.Load()

	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "development"
	}

	retention, err := positiveDuration("TRASH_RETENTION", DefaultTrashRetention)
	if err != nil {
		return nil, err
	}
	idleTTL, err := positiveDuration("SESSION_IDLE_TTL", DefaultSessionIdleTTL)
	if err != nil {
		return nil, err
	}
	absoluteTTL, err := positiveDuration("SESSION_ABSOLUTE_TTL", DefaultSessionAbsoluteTTL)
	if err != nil {
		return nil, err
	}

	return &Config{
		DBHost:     os.Getenv("POSTGRES_HOST"),
		DBPort:     os.Getenv("POSTGRES_PORT"),
		DBUser:     os.Getenv("POSTGRES_USER"),
		DBPass:     os.Getenv("POSTGRES_PASSWORD"),
		DBName:     os.Getenv("POSTGRES_DB"),
		ServerPort: os.Getenv("SERVER_PORT"),
		JWTSecret:  os.Getenv("JWT_SECRET"),
		AppEnv:     appEnv,

		DisableEmailVerification: os.Getenv("DISABLE_EMAIL_VERIFICATION") == "true",

		TrashRetention: retention,

		SessionIdleTTL:     idleTTL,
		SessionAbsoluteTTL: absoluteTTL,
		AllowedOrigins:     splitList(os.Getenv("ALLOWED_ORIGINS")),
	}, nil
}

// positiveDuration reads a Go duration such as "720h" from the environment, or
// returns def when the variable is unset.
func positiveDuration(name string, def time.Duration) (time.Duration, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return def, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration such as 720h, got %q", name, raw)
	}
	return d, nil
}

// splitList splits a comma-separated value, dropping blanks and surrounding spaces.
func splitList(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

// IsProduction reports whether the app is running in production, based on APP_ENV.
func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func (c *Config) IsDevelopment() bool {
	return c.AppEnv == "development"
}
