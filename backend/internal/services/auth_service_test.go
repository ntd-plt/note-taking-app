package services_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/middleware"
	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/services"
	"backend/internal/session"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
)

var testSessionConfig = session.Config{IdleTTL: 7 * 24 * time.Hour, AbsoluteTTL: 30 * 24 * time.Hour}

var testCookie = session.Cookie{Secure: true, MaxAge: testSessionConfig.AbsoluteTTL}

type authFixture struct {
	r        *gin.Engine
	hasher   *testutil.FakeHasher
	db       *testutil.FakeDatabase
	store    *testutil.FakeSessionStore
	sessions *session.Service
}

func newAuthRouter(db *testutil.FakeDatabase) *authFixture {
	return newAuthRouterWithValidator(db, &testutil.FakeEmailValidator{})
}

func newAuthRouterWithValidator(db *testutil.FakeDatabase, ev *testutil.FakeEmailValidator) *authFixture {
	gin.SetMode(gin.TestMode)
	store := testutil.NewFakeSessionStore()
	sessions := session.NewService(store, testSessionConfig)
	hasher := &testutil.FakeHasher{}
	authService := services.NewAuthService(services.NewUserService(db), hasher, ev, sessions, testCookie)

	r := gin.New()
	r.POST("/auth/login", authService.Login)
	r.POST("/auth/signup", authService.Signup)
	r.POST("/auth/logout", authService.Logout)
	r.POST("/auth/logout-all", middleware.RequireSession(sessions, testCookie), authService.LogoutAll)
	r.GET("/me", middleware.RequireSession(sessions, testCookie), func(c *gin.Context) {
		id, _ := middleware.UserID(c)
		c.String(http.StatusOK, id.String())
	})
	return &authFixture{r: r, hasher: hasher, db: db, store: store, sessions: sessions}
}

func addUser(db *testutil.FakeDatabase, email, password string) model.User {
	u := *model.New().WithEmail(email).WithPasswordHash([]byte("hashed:" + password))
	db.Users[u.ID] = u
	return u
}

func doJSON(t *testing.T, r *gin.Engine, method, path string, body any, cookies ...*http.Cookie) *httptest.ResponseRecorder {
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
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// sessionCookie returns the sid cookie the response set, failing if there is none.
func sessionCookie(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == session.CookieName {
			return c
		}
	}
	t.Fatalf("no %s cookie in the response; headers: %v", session.CookieName, w.Header())
	return nil
}

func hasNoSessionCookie(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == session.CookieName && c.MaxAge >= 0 {
			t.Errorf("unexpected %s cookie: %v", session.CookieName, c)
		}
	}
}

// wantLoggedIn checks the response started a working session for the user.
func wantLoggedIn(t *testing.T, f *authFixture, w *httptest.ResponseRecorder, email string) *http.Cookie {
	t.Helper()
	var resp services.UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response %q: %v", w.Body.String(), err)
	}
	if resp.Email != email || resp.ID == "" {
		t.Errorf("user = %+v, want email %s", resp, email)
	}
	if strings.Contains(w.Body.String(), "password") {
		t.Errorf("response leaks the password hash: %s", w.Body.String())
	}
	c := sessionCookie(t, w)
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/" {
		t.Errorf("cookie attributes = %+v, want HttpOnly, Secure, SameSite=Lax, Path=/", c)
	}
	if want := int(testSessionConfig.AbsoluteTTL / time.Second); c.MaxAge != want {
		t.Errorf("cookie Max-Age = %d, want %d", c.MaxAge, want)
	}
	me := doJSON(t, f.r, http.MethodGet, "/me", nil, c)
	if me.Code != http.StatusOK || me.Body.String() != resp.ID {
		t.Errorf("GET /me with the cookie = %d %q, want 200 %q", me.Code, me.Body.String(), resp.ID)
	}
	return c
}

func TestLoginEndpointSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	user := addUser(db, "alice@example.com", "secret123")
	f := newAuthRouter(db)

	w := doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "Alice@Example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	wantLoggedIn(t, f, w, "alice@example.com")
	if n := len(f.store.ForUser(user.ID)); n != 1 {
		t.Errorf("%d sessions stored, want 1", n)
	}
}

func TestLoginEndpointWrongPassword(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "alice@example.com",
		Password: "wrong-password",
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
	hasNoSessionCookie(t, w)
}

func TestLoginEndpointUnknownEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "nobody@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
	hasNoSessionCookie(t, w)
}

func TestLoginEndpointMalformedBody(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/login", "{not json")

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestLoginEndpointEmptyEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "",
		Password: "secret123",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestLoginEndpointEmptyPassword(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "alice@example.com",
		Password: "",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestLoginEndpointSessionStoreFails(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	f := newAuthRouter(db)
	f.store.Err = errors.New("connection refused")

	w := doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{
		Email:    "alice@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusInternalServerError, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "connection refused") {
		t.Errorf("response leaks the internal error: %s", w.Body.String())
	}
	hasNoSessionCookie(t, w)
}

func TestLoginReplacesTheBrowsersPreviousSession(t *testing.T) {
	db := testutil.NewFakeDatabase()
	user := addUser(db, "alice@example.com", "secret123")
	f := newAuthRouter(db)
	login := pkg.LoginRequest{Email: "alice@example.com", Password: "secret123"}

	first := sessionCookie(t, doJSON(t, f.r, http.MethodPost, "/auth/login", login))
	w := doJSON(t, f.r, http.MethodPost, "/auth/login", login, first)
	second := sessionCookie(t, w)

	if first.Value == second.Value {
		t.Error("logging in again kept the same session id")
	}
	if me := doJSON(t, f.r, http.MethodGet, "/me", nil, first); me.Code != http.StatusUnauthorized {
		t.Errorf("old session: GET /me = %d, want 401", me.Code)
	}
	if n := len(f.store.ForUser(user.ID)); n != 1 {
		t.Errorf("%d sessions stored, want 1", n)
	}
}

func TestSignupEndpointSuccessLogsTheUserIn(t *testing.T) {
	db := testutil.NewFakeDatabase()
	f := newAuthRouter(db)

	w := doJSON(t, f.r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
	}
	wantLoggedIn(t, f, w, "bob@example.com")
	if _, err := db.GetUserByEmail(ctx, "bob@example.com"); err != nil {
		t.Errorf("user not stored after signup: %v", err)
	}
}

func TestSignupEndpointSessionStoreFails(t *testing.T) {
	db := testutil.NewFakeDatabase()
	f := newAuthRouter(db)
	f.store.Err = errors.New("connection refused")

	w := doJSON(t, f.r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusInternalServerError, w.Body.String())
	}
	hasNoSessionCookie(t, w)
}

func TestSignupEndpointDuplicateEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Alice Again",
		Email:    "alice@example.com",
		Password: "other-password",
	})

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusConflict, w.Body.String())
	}
}

func TestSignupEndpointDuplicateEmailRace(t *testing.T) {
	db := testutil.NewFakeDatabase()
	// Simulates the DB-level unique-violation translated by
	// PostgreUserDataSource.AddUser when two signups for the same email race
	// each other and both pass the pre-check.
	db.Errs["AddUser"] = pkg.NewAlreadyExistsError("user with this email")
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusConflict, w.Body.String())
	}
}

func TestSignupEndpointDuplicateCheckDBErrorDoesNotCreateUser(t *testing.T) {
	db := testutil.NewFakeDatabase()
	db.Errs["GetUserByEmail"] = errors.New("connection pool exhausted")
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusInternalServerError, w.Body.String())
	}
	if len(db.Users) != 0 {
		t.Errorf("user should not have been created when the duplicate-check itself failed, got %d users", len(db.Users))
	}
}

func TestSignupEndpointUndeliverableEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouterWithValidator(db, &testutil.FakeEmailValidator{
		Classification: services.EmailVerificationUndeliverable,
	}).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnprocessableEntity, w.Body.String())
	}
	if _, err := db.GetUserByEmail(ctx, "bob@example.com"); err == nil {
		t.Error("user should not have been stored")
	}
}

func TestSignupEndpointDisposableEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouterWithValidator(db, &testutil.FakeEmailValidator{
		IsDisposable: true,
	}).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnprocessableEntity, w.Body.String())
	}
}

func TestSignupEndpointValidatorErrorFailsOpen(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouterWithValidator(db, &testutil.FakeEmailValidator{
		Err: errors.New("email validator timeout"),
	}).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
	}
	sessionCookie(t, w)
}

func TestSignupEndpointMalformedBody(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", "{not json")

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestSignupEndpointMalformedEmailFormat(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "not-an-email",
		Password: "secret123",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
	if _, err := db.GetUserByEmail(ctx, "not-an-email"); err == nil {
		t.Error("user should not have been stored for a malformed email")
	}
}

func TestSignupEndpointEmptyEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "",
		Password: "secret123",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestSignupEndpointMissingEmailField(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", map[string]string{
		"name":     "Bob",
		"password": "secret123",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestSignupEndpointEmailMissingDomain(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@",
		Password: "secret123",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestSignupEndpointOverlongEmailRejected(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newAuthRouter(db).r

	overlongEmail := strings.Repeat("a", 260) + "@example.com"
	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    overlongEmail,
		Password: "secret123",
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestSignupEndpointCaseInsensitiveDuplicateEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "bob@example.com", "secret123")
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob Again",
		Email:    "Bob@Example.com",
		Password: "other-password",
	})

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusConflict, w.Body.String())
	}
}

func TestSignupEndpointInternalErrorDoesNotLeakDetails(t *testing.T) {
	db := testutil.NewFakeDatabase()
	db.Errs["AddUser"] = errors.New(`pq: duplicate key value violates unique constraint "users_email_key"`)
	r := newAuthRouter(db).r

	w := doJSON(t, r, http.MethodPost, "/auth/signup", pkg.SignupRequest{
		Name:     "Bob",
		Email:    "bob@example.com",
		Password: "secret123",
	})

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusInternalServerError, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "pq:") {
		t.Errorf("response body leaks raw internal error: %s", w.Body.String())
	}
}

func TestLogoutEndsTheSession(t *testing.T) {
	db := testutil.NewFakeDatabase()
	user := addUser(db, "alice@example.com", "secret123")
	f := newAuthRouter(db)
	c := sessionCookie(t, doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{Email: "alice@example.com", Password: "secret123"}))

	w := doJSON(t, f.r, http.MethodPost, "/auth/logout", nil, c)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNoContent, w.Body.String())
	}
	if cleared := sessionCookie(t, w); cleared.MaxAge >= 0 || cleared.Value != "" {
		t.Errorf("cookie = %+v, want it cleared", cleared)
	}
	if me := doJSON(t, f.r, http.MethodGet, "/me", nil, c); me.Code != http.StatusUnauthorized {
		t.Errorf("after logout: GET /me = %d, want 401", me.Code)
	}
	if n := len(f.store.ForUser(user.ID)); n != 0 {
		t.Errorf("%d sessions left, want 0", n)
	}
}

func TestLogoutWithoutASessionSucceeds(t *testing.T) {
	f := newAuthRouter(testutil.NewFakeDatabase())
	stale := &http.Cookie{Name: session.CookieName, Value: "not-a-session"}
	for _, cookies := range [][]*http.Cookie{nil, {stale}} {
		if w := doJSON(t, f.r, http.MethodPost, "/auth/logout", nil, cookies...); w.Code != http.StatusNoContent {
			t.Errorf("cookies %v: status = %d, want %d", cookies, w.Code, http.StatusNoContent)
		}
	}
}

func TestLogoutStoreErrorIsReported(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	f := newAuthRouter(db)
	c := sessionCookie(t, doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{Email: "alice@example.com", Password: "secret123"}))
	f.store.Err = errors.New("boom")

	if w := doJSON(t, f.r, http.MethodPost, "/auth/logout", nil, c); w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
}

func TestLogoutAllEndsEveryDevice(t *testing.T) {
	db := testutil.NewFakeDatabase()
	alice := addUser(db, "alice@example.com", "secret123")
	addUser(db, "carol@example.com", "secret123")
	f := newAuthRouter(db)
	login := func(email string) *http.Cookie {
		return sessionCookie(t, doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{Email: email, Password: "secret123"}))
	}
	laptop, phone, carol := login("alice@example.com"), login("alice@example.com"), login("carol@example.com")

	w := doJSON(t, f.r, http.MethodPost, "/auth/logout-all", nil, laptop)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNoContent, w.Body.String())
	}
	for name, c := range map[string]*http.Cookie{"laptop": laptop, "phone": phone} {
		if me := doJSON(t, f.r, http.MethodGet, "/me", nil, c); me.Code != http.StatusUnauthorized {
			t.Errorf("%s: GET /me = %d, want 401", name, me.Code)
		}
	}
	if me := doJSON(t, f.r, http.MethodGet, "/me", nil, carol); me.Code != http.StatusOK {
		t.Errorf("another user's session: GET /me = %d, want 200", me.Code)
	}
	if n := len(f.store.ForUser(alice.ID)); n != 0 {
		t.Errorf("%d sessions left for the user, want 0", n)
	}
}

func TestLogoutAllNeedsASession(t *testing.T) {
	f := newAuthRouter(testutil.NewFakeDatabase())
	if w := doJSON(t, f.r, http.MethodPost, "/auth/logout-all", nil); w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestLoginAnswersUnknownEmailAndWrongPasswordAlike(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	f := newAuthRouter(db)

	wrong := doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{Email: "alice@example.com", Password: "nope-nope"})
	comparesForKnown := f.hasher.Compares
	unknown := doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{Email: "nobody@example.com", Password: "nope-nope"})

	if wrong.Code != http.StatusUnauthorized || unknown.Code != http.StatusUnauthorized {
		t.Fatalf("statuses = %d / %d, want 401 / 401", wrong.Code, unknown.Code)
	}
	if wrong.Body.String() != unknown.Body.String() {
		t.Errorf("bodies differ:\n  wrong password: %s\n  unknown email:  %s", wrong.Body.String(), unknown.Body.String())
	}
	if !strings.Contains(unknown.Body.String(), "wrong email or password") {
		t.Errorf("body = %s, want the generic message", unknown.Body.String())
	}
	// The unknown email still costs one password comparison, so timing tells nothing.
	if got := f.hasher.Compares - comparesForKnown; got != 1 {
		t.Errorf("an unknown email ran %d password comparisons, want 1 (like a known one)", got)
	}
}

func TestLoginDatabaseErrorIsA500WithoutDetails(t *testing.T) {
	db := testutil.NewFakeDatabase()
	db.Errs["GetUserByEmail"] = errors.New("pq: connection refused")
	f := newAuthRouter(db)

	w := doJSON(t, f.r, http.MethodPost, "/auth/login", pkg.LoginRequest{Email: "alice@example.com", Password: "secret123"})

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500; body: %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "pq:") {
		t.Errorf("response leaks the internal error: %s", w.Body.String())
	}
}

func TestSignupAccountRules(t *testing.T) {
	cases := []struct {
		name     string
		req      pkg.SignupRequest
		want     int
		wantText string
	}{
		{"blank name", pkg.SignupRequest{Name: "   ", Email: "a@example.com", Password: "secret123"}, http.StatusBadRequest, "name must be"},
		{"51-character name", pkg.SignupRequest{Name: strings.Repeat("n", 51), Email: "a@example.com", Password: "secret123"}, http.StatusBadRequest, "name must be"},
		{"50 emoji name", pkg.SignupRequest{Name: strings.Repeat("🙂", 50), Email: "a@example.com", Password: "secret123"}, http.StatusCreated, ""},
		{"5-byte password", pkg.SignupRequest{Name: "Bob", Email: "a@example.com", Password: "12345"}, http.StatusBadRequest, "password must be"},
		{"72-byte password", pkg.SignupRequest{Name: "Bob", Email: "a@example.com", Password: strings.Repeat("p", 72)}, http.StatusCreated, ""},
		{"73-byte password", pkg.SignupRequest{Name: "Bob", Email: "a@example.com", Password: strings.Repeat("p", 73)}, http.StatusBadRequest, "password must be"},
		{"19 emoji password (76 bytes)", pkg.SignupRequest{Name: "Bob", Email: "a@example.com", Password: strings.Repeat("🔑", 19)}, http.StatusBadRequest, "password must be"},
		{"malformed email", pkg.SignupRequest{Name: "Bob", Email: "bob@", Password: "secret123"}, http.StatusBadRequest, "email must be"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newAuthRouter(testutil.NewFakeDatabase())
			w := doJSON(t, f.r, http.MethodPost, "/auth/signup", tc.req)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d; body: %s", w.Code, tc.want, w.Body.String())
			}
			if tc.wantText != "" && !strings.Contains(w.Body.String(), tc.wantText) {
				t.Errorf("body = %s, want it to mention %q", w.Body.String(), tc.wantText)
			}
			if tc.want != http.StatusCreated && len(f.db.Users) != 0 {
				t.Errorf("a refused signup stored %d users", len(f.db.Users))
			}
		})
	}
}

func TestSignupStoresTheTrimmedName(t *testing.T) {
	db := testutil.NewFakeDatabase()
	f := newAuthRouter(db)

	w := doJSON(t, f.r, http.MethodPost, "/auth/signup", pkg.SignupRequest{Name: "  Bob  ", Email: "bob@example.com", Password: "secret123"})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", w.Code, w.Body.String())
	}
	u, err := db.GetUserByEmail(ctx, "bob@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if u.Name != "Bob" {
		t.Errorf("stored name = %q, want %q", u.Name, "Bob")
	}
}
