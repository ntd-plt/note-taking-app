package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/handlers"
	"backend/internal/services"
	"backend/internal/session"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
)

func testRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := testutil.NewFakeDatabase()
	sessions := session.NewService(testutil.NewFakeSessionStore(), session.Config{IdleTTL: time.Hour, AbsoluteTTL: 24 * time.Hour})
	cookie := session.Cookie{Secure: true, MaxAge: time.Hour}
	trash := services.NewTrashService(db, time.Hour)
	r, err := NewRouter(RouterDeps{
		Auth:           handlers.NewAuthHandler(services.NewAuthService(db, &testutil.FakeHasher{}, &testutil.FakeEmailValidator{}), sessions, cookie),
		Users:          handlers.NewUserHandler(services.NewUserService(db)),
		Pages:          handlers.NewPagesHandler(services.NewPagesService(db)),
		Ops:            handlers.NewOpsHandler(services.NewOpsService(db, trash)),
		Trash:          handlers.NewTrashHandler(trash),
		Sessions:       sessions,
		Cookie:         cookie,
		AllowedOrigins: []string{"https://app.example.com"},
	})
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestProtectedRoutesNeedASession(t *testing.T) {
	r := testRouter(t)
	routes := [][2]string{
		{http.MethodGet, "/api/v1/users/me"},
		{http.MethodPut, "/api/v1/users/me"},
		{http.MethodGet, "/api/v1/workspace"},
		{http.MethodGet, "/api/v1/pages"},
		{http.MethodPost, "/api/v1/ops"},
		{http.MethodGet, "/api/v1/trash"},
		{http.MethodPost, "/api/v1/auth/logout-all"},
	}
	for _, rt := range routes {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(rt[0], rt[1], nil))
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without a session: status = %d, want 401", rt[0], rt[1], w.Code)
		}
	}
}

func TestPublicAuthRoutesNeedNoSession(t *testing.T) {
	r := testRouter(t)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil))
	if w.Code != http.StatusNoContent {
		t.Errorf("POST /auth/logout: status = %d, want 204", w.Code)
	}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh-token", nil))
	if w.Code != http.StatusNotFound {
		t.Errorf("POST /auth/refresh-token: status = %d, want 404 (removed)", w.Code)
	}
}

func TestCrossSiteLoginIsRefused(t *testing.T) {
	r := testRouter(t)
	body := `{"email":"a@example.com","password":"secret123"}`
	for origin, want := range map[string]int{
		"https://evil.example":    http.StatusForbidden,
		"https://app.example.com": http.StatusUnauthorized, // allowed through; the user does not exist
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", origin)
		req.Header.Set("Sec-Fetch-Site", "cross-site")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != want {
			t.Errorf("login from %s: status = %d, want %d", origin, w.Code, want)
		}
	}
}
