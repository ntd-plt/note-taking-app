package configs

import (
	"os"

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
}

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
	}
}

func Load() (*Config, error) {
	err := godotenv.Load()
	if err != nil {
		return nil, err
	}

	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "development"
	}

	return &Config{
		DBHost:     os.Getenv("DB_HOST"),
		DBPort:     os.Getenv("DB_PORT"),
		DBUser:     os.Getenv("DB_USER"),
		DBPass:     os.Getenv("DB_PASS"),
		DBName:     os.Getenv("DB_NAME"),
		ServerPort: os.Getenv("SERVER_PORT"),
		JWTSecret:  os.Getenv("JWT_SECRET"),
		AppEnv:     appEnv,
	}, nil
}

// IsProduction reports whether the app is running in production, based on APP_ENV.
func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}
