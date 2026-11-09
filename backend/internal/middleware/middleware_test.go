package middleware_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backend/internal/middleware"
	"backend/internal/session"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var cookie = session.Cookie{Secure: true, MaxAge: time.Hour}

func newSessions() (*session.Service, *testutil.FakeSessionStore) {
	store := testutil.NewFakeSessionStore()
	return session.NewService(store, session.Config{IdleTTL: time.Hour, AbsoluteTTL: 24 * time.Hour}), store
}

func protectedRouter(sessions middleware.SessionLookup) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/protected", middleware.RequireSession(sessions, cookie), func(c *gin.Context) {
		id, ok := middleware.UserID(c)
		if !ok {
			c.Status(http.StatusTeapot)
			return
		}
		c.String(http.StatusOK, id.String())
	})
	return r
}

func get(r http.Handler, path string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRequireSessionLetsALiveSessionThrough(t *testing.T) {
	sessions, _ := newSessions()
	user := uuid.New()
	id, _, err := sessions.Create(context.Background(), user, "")
	if err != nil {
		t.Fatal(err)
	}

	w := get(protectedRouter(sessions), "/protected", &http.Cookie{Name: session.CookieName, Value: id})

	if w.Code != http.StatusOK || w.Body.String() != user.String() {
		t.Errorf("got %d %q, want 200 %q", w.Code, w.Body.String(), user)
	}
}

func TestRequireSessionRejectsMissingAndUnknownCookies(t *testing.T) {
	sessions, _ := newSessions()
	r := protectedRouter(sessions)

	if w := get(r, "/protected"); w.Code != http.StatusUnauthorized {
		t.Errorf("no cookie: status = %d, want 401", w.Code)
	}
	w := get(r, "/protected", &http.Cookie{Name: session.CookieName, Value: "forged"})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("unknown session: status = %d, want 401", w.Code)
	}
	cleared := false
	for _, c := range w.Result().Cookies() {
		cleared = cleared || (c.Name == session.CookieName && c.MaxAge < 0)
	}
	if !cleared {
		t.Error("an unknown session cookie was not cleared")
	}
}

type failingLookup struct{}

func (failingLookup) Lookup(context.Context, string) (session.Session, error) {
	return session.Session{}, errors.New("db down")
}

func TestRequireSessionReportsStoreErrors(t *testing.T) {
	w := get(protectedRouter(failingLookup{}), "/protected", &http.Cookie{Name: session.CookieName, Value: "x"})
	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

func csrfRouter(t *testing.T, allowed ...string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	csrf, err := middleware.CSRF(allowed)
	if err != nil {
		t.Fatal(err)
	}
	r := gin.New()
	r.Use(csrf)
	r.Any("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
	return r
}

func send(r http.Handler, method string, headers map[string]string) int {
	req := httptest.NewRequest(method, "http://api.example.com/x", nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestCSRFRefusesCrossSiteWrites(t *testing.T) {
	r := csrfRouter(t, "https://app.example.com")
	cases := []struct {
		name    string
		method  string
		headers map[string]string
		want    int
	}{
		{"cross-site POST", http.MethodPost, map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"}, http.StatusForbidden},
		{"cross-site DELETE, Origin only", http.MethodDelete, map[string]string{"Origin": "https://evil.example"}, http.StatusForbidden},
		{"same-origin POST", http.MethodPost, map[string]string{"Sec-Fetch-Site": "same-origin", "Origin": "http://api.example.com"}, http.StatusOK},
		{"Origin matches Host", http.MethodPost, map[string]string{"Origin": "http://api.example.com"}, http.StatusOK},
		{"allowed origin", http.MethodPut, map[string]string{"Sec-Fetch-Site": "same-site", "Origin": "https://app.example.com"}, http.StatusOK},
		{"cross-site GET is safe", http.MethodGet, map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"}, http.StatusOK},
		{"non-browser client", http.MethodPost, nil, http.StatusOK},
	}
	for _, tc := range cases {
		if got := send(r, tc.method, tc.headers); got != tc.want {
			t.Errorf("%s: status = %d, want %d", tc.name, got, tc.want)
		}
	}
}

func TestCSRFRejectsAMalformedOrigin(t *testing.T) {
	if _, err := middleware.CSRF([]string{"app.example.com"}); err == nil {
		t.Error("want an error for an origin without a scheme")
	}
}

func corsRouter(allowed ...string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.CORS(allowed))
	r.POST("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
	return r
}

func TestCORSAnswersOnlyAllowedOrigins(t *testing.T) {
	r := corsRouter("https://app.example.com")
	for origin, want := range map[string]string{
		"https://app.example.com": "https://app.example.com",
		"https://evil.example":    "",
	} {
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != want {
			t.Errorf("%s: Allow-Origin = %q, want %q", origin, got, want)
		}
		wantCreds := ""
		if want != "" {
			wantCreds = "true"
		}
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got != wantCreds {
			t.Errorf("%s: Allow-Credentials = %q, want %q", origin, got, wantCreds)
		}
	}
}

func TestCORSWithNoAllowedOriginsAnswersNoOne(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/x", nil)
	req.Header.Set("Origin", "https://anything.example")
	w := httptest.NewRecorder()
	corsRouter().ServeHTTP(w, req)
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Allow-Origin = %q, want none", got)
	}
}

func TestCORSPreflight(t *testing.T) {
	r := corsRouter("https://app.example.com")
	for origin, wantMethods := range map[string]bool{"https://app.example.com": true, "https://evil.example": false} {
		req := httptest.NewRequest(http.MethodOptions, "/x", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNoContent {
			t.Errorf("%s: status = %d, want 204", origin, w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Methods") != ""; got != wantMethods {
			t.Errorf("%s: Allow-Methods set = %v, want %v", origin, got, wantMethods)
		}
	}
}
