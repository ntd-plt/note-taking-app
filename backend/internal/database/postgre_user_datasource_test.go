package database_test

import (
	"testing"
	"time"

	"backend/internal/apperr"
	"backend/internal/database"
	"backend/internal/model"

	"github.com/google/uuid"
)

func TestPostgresUpdateUserReturnsTheStoredRow(t *testing.T) {
	_, pool := newItemsDB(t)
	users := database.NewPostgreUserDataSource(pool)
	u := model.NewUser("Alice", uuid.NewString()+"@example.com", []byte("h"))
	u.UpdatedAt = time.Now().Add(-time.Hour)
	if err := users.AddUser(ctx, u); err != nil {
		t.Fatal(err)
	}

	u.Name = "Alice L."
	got, err := users.UpdateUser(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Alice L." || got.ID != u.ID || !got.UpdatedAt.After(u.UpdatedAt) {
		t.Errorf("got %+v, want the renamed user with a new updated_at", got)
	}

	other := model.NewUser("Bob", uuid.NewString()+"@example.com", []byte("h"))
	if err := users.AddUser(ctx, other); err != nil {
		t.Fatal(err)
	}
	other.Email = u.Email
	if _, err := users.UpdateUser(ctx, other); !apperr.Is(err, apperr.Conflict) {
		t.Errorf("taking another user's email: err = %v, want Conflict", err)
	}
	if _, err := users.UpdateUser(ctx, model.NewUser("X", "x@example.com", nil)); !apperr.Is(err, apperr.NotFound) {
		t.Errorf("unknown user: err = %v, want NotFound", err)
	}
}
