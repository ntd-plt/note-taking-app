// Command dburl prints the database URL the server uses, so tools such as
// migrate connect the same way, with the parts escaped.
package main

import (
	"flag"
	"fmt"
	"net/url"
	"os"

	"backend/internal/configs"
)

func main() {
	sslmode := flag.String("sslmode", "", "sslmode to add when the URL is built from the POSTGRES_* parts")
	flag.Parse()
	cfg, err := configs.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "dburl:", err)
		os.Exit(1)
	}
	u, err := migrateURL(cfg, *sslmode)
	if err != nil {
		fmt.Fprintln(os.Stderr, "dburl:", err)
		os.Exit(1)
	}
	fmt.Println(u)
}

// migrateURL is DATABASE_URL as given, or the URL built from the parts with
// sslmode added; a provider's URL already says how to connect.
func migrateURL(cfg *configs.Config, sslmode string) (string, error) {
	if cfg.DatabaseURL != "" || sslmode == "" {
		return cfg.DSN(), nil
	}
	u, err := url.Parse(cfg.DSN())
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("sslmode", sslmode)
	u.RawQuery = q.Encode()
	return u.String(), nil
}
