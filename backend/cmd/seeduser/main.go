// Command seeduser creates a development user from SEED_USER_EMAIL, SEED_USER_PASSWORD and
// SEED_USER_NAME (set in .env), so a freshly reset database has an account to log in with.
// It then fills that user's workspace with a sample tree of pages and blocks. It does nothing
// when the variables are not all set, and leaves a user who already has pages alone.
package main

import (
	"context"
	stderrors "errors"
	"fmt"
	"os"
	"strings"

	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/pkg/hash"
	"backend/internal/services"

	"github.com/google/uuid"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "seed-user:", err)
		os.Exit(1)
	}
}

func run() error {
	ctx := context.Background()
	cfg, err := configs.Load()
	if err != nil {
		return err
	}
	if cfg.IsProduction() {
		return stderrors.New("refusing to seed a user when APP_ENV=production")
	}

	rawEmail := os.Getenv("SEED_USER_EMAIL")
	password := os.Getenv("SEED_USER_PASSWORD")
	rawName := os.Getenv("SEED_USER_NAME")
	if strings.TrimSpace(rawEmail) == "" || password == "" || strings.TrimSpace(rawName) == "" {
		fmt.Println("seed-user: SEED_USER_EMAIL, SEED_USER_PASSWORD and SEED_USER_NAME are not all set in .env; skipping.")
		return nil
	}
	// Read the sample tree first, so a mistake in the file fails before anything is created.
	tree, err := parseTree(sampleTreeJSON)
	if err != nil {
		return err
	}

	pool, err := database.NewPool(ctx, cfg.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()

	users := database.NewPostgreUserDataSource(pool)
	items := database.NewPostgreItemsDataSource(pool)
	auth := services.NewAuthService(users, hash.NewBcryptHasher(), services.NoopEmailValidator{})

	user, err := auth.Signup(ctx, rawName, rawEmail, password)
	email := services.NormalizeEmail(rawEmail)
	switch {
	case err == services.ErrEmailAlreadyExists:
		if user, err = users.GetUserByEmail(ctx, email); err != nil {
			return err
		}
		fmt.Printf("seed-user: %s already exists.\n", email)
	case err != nil:
		return err
	default:
		fmt.Printf("seed-user: created %s (%s).\n", email, user.Name)
	}

	seeded, err := hasPages(ctx, items, user.ID)
	if err != nil {
		return err
	}
	if seeded {
		fmt.Printf("seed-user: %s already has pages; leaving them alone.\n", email)
		return nil
	}
	workspace, err := items.GetWorkspace(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("finding the workspace of %s: %w", email, err)
	}
	rows, _ := buildItems(workspace.ID, tree)
	if err := items.ApplyOps(ctx, user.ID, createOps(rows)); err != nil {
		return err
	}
	fmt.Printf("seed-user: created %d sample items.\n", len(rows))
	return nil
}

// hasPages reports whether the user already has any page, trashed ones included, so
// running the seed twice does not add a second sample tree.
func hasPages(ctx context.Context, items *database.PostgreItemsDataSource, userID uuid.UUID) (bool, error) {
	pages, err := items.ListPages(ctx, userID)
	if err != nil || len(pages) > 0 {
		return len(pages) > 0, err
	}
	trashed, err := items.ListTrash(ctx, userID)
	return len(trashed) > 0, err
}
