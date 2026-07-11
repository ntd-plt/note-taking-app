package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/middleware"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const testSecret = "jwt-test-secret"

// newProtectedRouter wires middleware.Auth in front of a probe handler that
// echoes the userID the middleware stored in the context.
func newProtectedRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.Auth(services.NewJWTService()))
	r.GET("/protected", func(c *gin.Context) {
		userID, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "userID not set"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"user_id": userID.(uuid.UUID).String()})
	})
	return r
}

func doProtected(r *gin.Engine, authHeader string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAuthMiddlewareValidToken(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	r := newProtectedRouter()
	userID := uuid.New()

	token, err := services.NewJWTService().GenerateAccessToken(userID)
	if err != nil {
		t.Fatalf("generating token: %v", err)
	}

	w := doProtected(r, "Bearer "+token)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	want := `"user_id":"` + userID.String() + `"`
	if body := w.Body.String(); !strings.Contains(body, want) {
		t.Errorf("body = %s, want it to contain %s", body, want)
	}
}

func TestAuthMiddlewareMissingHeader(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	r := newProtectedRouter()

	w := doProtected(r, "")

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

func TestAuthMiddlewareMalformedHeader(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	r := newProtectedRouter()

	for _, header := range []string{"just-a-token", "Basic abc123"} {
		w := doProtected(r, header)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("header %q: status = %d, want %d", header, w.Code, http.StatusUnauthorized)
		}
	}
}

func TestAuthMiddlewareInvalidToken(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	r := newProtectedRouter()

	w := doProtected(r, "Bearer not-a-valid-jwt")

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

func TestAuthMiddlewareExpiredToken(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	r := newProtectedRouter()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": uuid.New().String(),
		"exp":     time.Now().Add(-time.Hour).Unix(),
	})
	tokenString, err := token.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("signing token: %v", err)
	}

	w := doProtected(r, "Bearer "+tokenString)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}
