package handlers_test

import (
	"context"
	"net/http"
	"time"

	"backend/internal/configs"
	"backend/internal/handlers"
	"backend/internal/services"
	"backend/internal/session"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var testSessionConfig = session.Config{IdleTTL: 7 * 24 * time.Hour, AbsoluteTTL: 30 * 24 * time.Hour}

var testCookie = session.Cookie{Secure: true, MaxAge: testSessionConfig.AbsoluteTTL}

type itemStore interface {
	services.PageReader
	services.TreeWriter
	services.TrashStore
}

// appConfig picks the parts of a test app; zero fields get defaults.
type appConfig struct {
	users     *testutil.FakeUserStore
	items     itemStore
	validator *testutil.FakeEmailValidator
	retention time.Duration
}

// testApp is the real router over fakes.
type testApp struct {
	r        *gin.Engine
	users    *testutil.FakeUserStore
	hasher   *testutil.FakeHasher
	store    *testutil.FakeSessionStore
	sessions *session.Service
}

// newApp panics on a setup error: it means the test itself is broken.
func newApp(cfg appConfig) *testApp {
	gin.SetMode(gin.TestMode)
	users, items := testutil.NewFakeStores()
	if cfg.users != nil {
		users = cfg.users
	}
	var store itemStore = items
	if cfg.items != nil {
		store = cfg.items
	}
	if cfg.validator == nil {
		cfg.validator = &testutil.FakeEmailValidator{}
	}
	if cfg.retention == 0 {
		cfg.retention = configs.DefaultTrashRetention
	}
	sessionStore := testutil.NewFakeSessionStore()
	sessions := session.NewService(sessionStore, testSessionConfig)
	hasher := &testutil.FakeHasher{}
	trash := services.NewTrashService(store, cfg.retention)
	r, err := handlers.NewRouter(handlers.RouterDeps{
		Auth:           handlers.NewAuthHandler(services.NewAuthService(users, hasher, cfg.validator), sessions, testCookie),
		Users:          handlers.NewUserHandler(services.NewUserService(users)),
		Pages:          handlers.NewPagesHandler(services.NewPagesService(store)),
		Ops:            handlers.NewOpsHandler(services.NewOpsService(store, trash)),
		Trash:          handlers.NewTrashHandler(trash),
		Sessions:       sessions,
		Cookie:         testCookie,
		AllowedOrigins: []string{"https://app.example.com"},
	})
	if err != nil {
		panic(err)
	}
	return &testApp{r: r, users: users, hasher: hasher, store: sessionStore, sessions: sessions}
}

// as returns the app with every request sent by userID, through a real session.
func (a *testApp) as(userID uuid.UUID) http.Handler {
	id, _, err := a.sessions.Create(context.Background(), userID, "test")
	if err != nil {
		panic(err)
	}
	cookie := &http.Cookie{Name: session.CookieName, Value: id}
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		req.AddCookie(cookie)
		a.r.ServeHTTP(w, req)
	})
}
