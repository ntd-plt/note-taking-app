package handlers_test

import (
	"net/http"
	"strings"
	"testing"

	"backend/internal/testutil"
)

func TestRequestBodiesRejectUnknownFields(t *testing.T) {
	db := testutil.NewFakeUserStore()
	user := addUser(db, "alice@example.com", "secret123")
	auth := newAuthRouter(db).r
	users := newUsersRouter(db, user)

	cases := []struct {
		name  string
		code  int
		field string
		send  func() (int, string)
	}{
		{"login typo", 400, "pasword", func() (int, string) {
			w := doJSON(t, auth, http.MethodPost, "/api/v1/auth/login", `{"email":"alice@example.com","password":"secret123","pasword":"x"}`)
			return w.Code, w.Body.String()
		}},
		{"signup extra", 400, "remember_me", func() (int, string) {
			w := doJSON(t, auth, http.MethodPost, "/api/v1/auth/signup", `{"name":"Bob","email":"bob@example.com","password":"secret123","remember_me":true}`)
			return w.Code, w.Body.String()
		}},
		{"profile typo", 400, "nmae", func() (int, string) {
			w := doJSON(t, users, http.MethodPut, "/api/v1/users/me", `{"nmae":"Alice"}`)
			return w.Code, w.Body.String()
		}},
	}
	for _, tc := range cases {
		code, body := tc.send()
		if code != tc.code || !strings.Contains(body, tc.field) {
			t.Errorf("%s: got %d %s, want %d naming %q", tc.name, code, body, tc.code, tc.field)
		}
	}
	if len(db.Users) != 1 {
		t.Errorf("a refused signup created a user: %d users", len(db.Users))
	}
}

func TestRequestBodiesRejectTrailingData(t *testing.T) {
	db := testutil.NewFakeUserStore()
	addUser(db, "alice@example.com", "secret123")
	w := doJSON(t, newAuthRouter(db).r, http.MethodPost, "/api/v1/auth/login", `{"email":"alice@example.com","password":"secret123"} {"x":1}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400; body %s", w.Code, w.Body.String())
	}
}
