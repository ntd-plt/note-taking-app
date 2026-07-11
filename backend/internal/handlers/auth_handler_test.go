package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/handlers"
	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func newAuthRouter(db *testutil.FakeDatabase, ts *testutil.FakeTokenService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService(db, &testutil.FakeHasher{}, ts)
	h := handlers.NewAuthHandler(authService)

	r := gin.New()
	r.POST("/auth/login", h.Login)
	r.POST("/auth/signup", h.Signup)
	r.POST("/auth/refresh-token", h.RefreshToken)
	return r
}

func addUser(db *testutil.FakeDatabase, email, password string) model.User {
	u := *model.New().WithEmail(email).WithPasswordHash([]byte("hashed:" + password))
	db.Users[u.ID] = u
	return u
}

func doJSON(t *testing.T, r *gin.Engine, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if s, ok := body.(string); ok {
			buf.WriteString(s)
		} else if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encoding request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func decodeAuthResponse(t *testing.T, w *httptest.ResponseRecorder) pkg.AuthResponse {
	t.Helper()
	var resp pkg.AuthResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response %q: %v", w.Body.String(), err)
	}
	return resp
}

func TestLoginEndpointSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	user := addUser(db, "alice@example.com", "secret123")
	r := newAuthRouter(db, &testutil.FakeTokenService{ValidUserID: user.ID})

	w := doJSON(t, r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "alice@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	resp := decodeAuthResponse(t, w)
	if resp.AccessToken == "" || resp.RefreshToken == "" {
		t.Errorf("expected both tokens, got %+v", resp)
	}
}

func TestLoginEndpointWrongPassword(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	r := newAuthRouter(db, &testutil.FakeTokenService{})

	w := doJSON(t, r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "alice@example.com",
		Password: "wrong-password",
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

func TestLoginEndpointUnknownEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db, &testutil.FakeTokenService{})

	w := doJSON(t, r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "nobody@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

func TestLoginEndpointMalformedBody(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db, &testutil.FakeTokenService{})

	w := doJSON(t, r, http.MethodPost, "/auth/login", "{not json")

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestSignupEndpointSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db, &testutil.FakeTokenService{ValidUserID: uuid.New()})

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupResponse{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	resp := decodeAuthResponse(t, w)
	if resp.AccessToken == "" || resp.RefreshToken == "" {
		t.Errorf("expected both tokens, got %+v", resp)
	}
	if _, err := db.GetUserByEmail("bob@example.com"); err != nil {
		t.Errorf("user not stored after signup: %v", err)
	}
}

func TestSignupEndpointDuplicateEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	r := newAuthRouter(db, &testutil.FakeTokenService{})

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupResponse{
		Name:     "Alice Again",
		Email:    "alice@example.com",
		Password: "other-password",
	})

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusInternalServerError, w.Body.String())
	}
}

func TestSignupEndpointMalformedBody(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db, &testutil.FakeTokenService{})

	w := doJSON(t, r, http.MethodPost, "/auth/signup", "{not json")

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestRefreshTokenEndpointSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db, &testutil.FakeTokenService{ValidUserID: uuid.New()})

	w := doJSON(t, r, http.MethodPost, "/auth/refresh-token", pkg.RefreshTokenRequest{
		Token: "refresh-token",
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	resp := decodeAuthResponse(t, w)
	if resp.AccessToken == "" {
		t.Errorf("expected an access token, got %+v", resp)
	}
}

func TestRefreshTokenEndpointInvalidToken(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db, &testutil.FakeTokenService{})

	w := doJSON(t, r, http.MethodPost, "/auth/refresh-token", pkg.RefreshTokenRequest{
		Token: "not-a-refresh-token",
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

func TestRefreshTokenEndpointMalformedBody(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db, &testutil.FakeTokenService{})

	w := doJSON(t, r, http.MethodPost, "/auth/refresh-token", "{not json")

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}
