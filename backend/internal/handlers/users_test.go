package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"backend/internal/handlers"
	"backend/internal/model"
	"backend/internal/testutil"
)

func newUsersRouter(db *testutil.FakeUserStore, user model.User) http.Handler {
	return newApp(appConfig{users: db}).as(user.ID)
}

func storedUser(t *testing.T, db *testutil.FakeUserStore, user model.User) model.User {
	t.Helper()
	u, err := db.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func TestUpdateUserChangesTheTrimmedName(t *testing.T) {
	db := testutil.NewFakeUserStore()
	user := addUser(db, "alice@example.com", "secret123")
	r := newUsersRouter(db, user)

	w := doJSON(t, r, http.MethodPut, "/api/v1/users/me", map[string]string{"name": "  Alice Liddell  "})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
	}
	var resp handlers.UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Name != "Alice Liddell" {
		t.Errorf("response name = %q, want %q", resp.Name, "Alice Liddell")
	}
	if got := storedUser(t, db, user).Name; got != "Alice Liddell" {
		t.Errorf("stored name = %q, want %q", got, "Alice Liddell")
	}
}

func TestUpdateUserRefusesABadName(t *testing.T) {
	for _, name := range []string{"   ", strings.Repeat("n", 51)} {
		db := testutil.NewFakeUserStore()
		user := addUser(db, "alice@example.com", "secret123")
		before := storedUser(t, db, user).Name

		w := doJSON(t, newUsersRouter(db, user), http.MethodPut, "/api/v1/users/me", map[string]string{"name": name})

		if w.Code != http.StatusBadRequest {
			t.Errorf("name %q: status = %d, want 400", name, w.Code)
		}
		if !strings.Contains(w.Body.String(), "name must be") {
			t.Errorf("name %q: body = %s", name, w.Body.String())
		}
		if got := storedUser(t, db, user).Name; got != before {
			t.Errorf("name %q: stored name changed to %q", name, got)
		}
	}
}

func TestUpdateUserRefusesAnEmailChange(t *testing.T) {
	db := testutil.NewFakeUserStore()
	user := addUser(db, "alice@example.com", "secret123")
	r := newUsersRouter(db, user)

	for _, body := range []map[string]string{
		{"email": "new@example.com"},
		{"name": "Alice", "email": "alice@example.com"},
	} {
		w := doJSON(t, r, http.MethodPut, "/api/v1/users/me", body)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%v: status = %d, want 400", body, w.Code)
		}
		if !strings.Contains(w.Body.String(), "email can't be changed") {
			t.Errorf("%v: body = %s", body, w.Body.String())
		}
	}
	got := storedUser(t, db, user)
	if got.Email != "alice@example.com" || got.Name != user.Name {
		t.Errorf("stored user changed to %+v", got)
	}
}
