package configs

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// DatabaseURL is a full connection URL (DATABASE_URL), as hosting providers
	// such as Render give it. When set it wins over the DB* parts below.
	DatabaseURL string

	DBHost string
	DBPort string
	DBUser string
	DBPass string
	DBName string
	// Port is the HTTP port to listen on (PORT; hosting providers such as Render
	// set it). Defaults to 8080.
	Port string

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
	DefaultPort               = "8080"
	DefaultTrashRetention     = 30 * 24 * time.Hour
	DefaultSessionIdleTTL     = 7 * 24 * time.Hour
	DefaultSessionAbsoluteTTL = 30 * 24 * time.Hour
)

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
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
		return nil, fmt.Errorf("PORT must be a port number between 1 and 65535, got %q", port)
	}
	origins := splitList(os.Getenv("ALLOWED_ORIGINS"))
	if slices.Contains(origins, "*") {
		return nil, fmt.Errorf("ALLOWED_ORIGINS must list exact origins such as https://app.example.com, not \"*\": the API is called with the session cookie")
	}

	return &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),

		DBHost: os.Getenv("POSTGRES_HOST"),
		DBPort: os.Getenv("POSTGRES_PORT"),
		DBUser: os.Getenv("POSTGRES_USER"),
		DBPass: os.Getenv("POSTGRES_PASSWORD"),
		DBName: os.Getenv("POSTGRES_DB"),
		Port:   port,
		AppEnv: appEnv,

		DisableEmailVerification: os.Getenv("DISABLE_EMAIL_VERIFICATION") == "true",

		TrashRetention: retention,

		SessionIdleTTL:     idleTTL,
		SessionAbsoluteTTL: absoluteTTL,
		AllowedOrigins:     origins,
	}, nil
}

// DSN is the Postgres connection URL: DatabaseURL when set, or else one built from
// the DB* parts. The parts are escaped, so a password with characters such as
// @ / : ? # or % still connects.
func (c *Config) DSN() string {
	if c.DatabaseURL != "" {
		return c.DatabaseURL
	}
	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(c.DBUser, c.DBPass),
		Host:   net.JoinHostPort(c.DBHost, c.DBPort),
		Path:   "/" + c.DBName,
	}
	return u.String()
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

// SecureCookies reports whether cookies are sent over HTTPS only. Local
// development runs over plain http, so it is the only place they are not.
func (c *Config) SecureCookies() bool {
	return !c.IsDevelopment()
}
