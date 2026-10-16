// Command seeduser creates a development user from SEED_USER_EMAIL, SEED_USER_PASSWORD and
// SEED_USER_NAME (set in .env), so a freshly reset database has an account to log in with.
// It then fills that user's workspace with a small sample tree of folders and notes. It does
// nothing when the variables are not all set, and leaves a user who already has items alone.
package main

import (
	stderrors "errors"
	"fmt"
	"os"
	"strings"

	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/pkg/hash"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "seed-user:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := configs.Load()
	if err != nil {
		return err
	}
	if cfg.IsProduction() {
		return stderrors.New("refusing to seed a user when APP_ENV=production")
	}

	email := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_USER_EMAIL")))
	password := os.Getenv("SEED_USER_PASSWORD")
	name := strings.TrimSpace(os.Getenv("SEED_USER_NAME"))
	if email == "" || password == "" || name == "" {
		fmt.Println("seed-user: SEED_USER_EMAIL, SEED_USER_PASSWORD and SEED_USER_NAME are not all set in .env; skipping.")
		return nil
	}

	// Read the sample tree first, so a mistake in the file fails before anything is created.
	tree, err := parseTree(sampleTreeJSON)
	if err != nil {
		return err
	}

	pool, err := database.NewPool(cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	passwordHash, err := hash.NewBcryptHasher().Hash([]byte(password))
	if err != nil {
		return err
	}
	users := database.NewPostgreUserDataSource(pool)
	items := database.NewPostgreItemsDataSource(pool)

	user := model.New().WithEmail(email).WithUsername(name).WithPasswordHash(passwordHash)
	err = users.AddUser(*user)
	var exists *pkg.AlreadyExistsError
	switch {
	case stderrors.As(err, &exists):
		existing, err := users.GetUserByEmail(email)
		if err != nil {
			return err
		}
		user = &existing
		fmt.Printf("seed-user: %s already exists.\n", email)
	case err != nil:
		return err
	default:
		fmt.Printf("seed-user: created %s (%s).\n", email, name)
	}

	have, err := items.ListItems(user.ID, model.ItemFilter{})
	if err != nil {
		return err
	}
	if len(have) > 0 {
		fmt.Printf("seed-user: %s already has %d items; leaving them alone.\n", email, len(have))
		return nil
	}
	n, err := insertTree(items, user.ID, nil, tree)
	if err != nil {
		return err
	}
	fmt.Printf("seed-user: created %d sample items.\n", n)
	return nil
}
