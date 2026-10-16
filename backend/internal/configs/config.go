package configs

import (
	"fmt"
	"os"
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
}

const DefaultTrashRetention = 30 * 24 * time.Hour

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

	retention := DefaultTrashRetention
	if raw := os.Getenv("TRASH_RETENTION"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil || d <= 0 {
			return nil, fmt.Errorf("TRASH_RETENTION must be a positive duration such as 720h, got %q", raw)
		}
		retention = d
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
	}, nil
}

// IsProduction reports whether the app is running in production, based on APP_ENV.
func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func (c *Config) IsDevelopment() bool {
	return c.AppEnv == "development"
}
