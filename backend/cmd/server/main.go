package main

import (
	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/handlers"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"backend/internal/session"
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
)

// @title           Note Taking App API
// @version         1.0
// @description     API for managing users and their pages and blocks.
// @description     Authentication: log in with POST /auth/login (or sign up), which sets the session in the HttpOnly "sid" cookie. The browser sends it with every later request, including from this page. State-changing requests from other sites are refused.
// @BasePath        /api/v1

// @securityDefinitions.apikey  SessionCookie
// @in                          cookie
// @name                        sid
// @description                 Set by POST /auth/login or /auth/signup; the browser sends it by itself.

func main() {
	if err := run(); err != nil {
		log.Printf("server: %v", err)
		os.Exit(1)
	}
}

// run starts the API and serves until SIGINT or SIGTERM, then shuts down
// gracefully. Errors come back instead of panicking, so deferred cleanup runs.
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := configs.Load()
	if err != nil {
		return err
	}

	pool, err := database.NewPool(ctx, cfg.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()

	userDataSource := database.NewPostgreUserDataSource(pool)
	itemsDataSource := database.NewPostgreItemsDataSource(pool)

	hasher := hash.NewBcryptHasher()
	sessions := session.NewService(database.NewPostgreSessionStore(pool), session.Config{
		IdleTTL:     cfg.SessionIdleTTL,
		AbsoluteTTL: cfg.SessionAbsoluteTTL,
	})
	cookie := session.Cookie{Secure: cfg.SecureCookies(), MaxAge: sessions.MaxAge()}

	var emailValidator services.EmailValidator
	if cfg.DisableEmailVerification {
		log.Println("email verification disabled via DISABLE_EMAIL_VERIFICATION")
		emailValidator = services.NoopEmailValidator{}
	} else {
		emailValidator = services.NewEmailValidator()
	}

	trashService := services.NewTrashService(itemsDataSource, cfg.TrashRetention)

	router, err := NewRouter(RouterDeps{
		Auth:           handlers.NewAuthHandler(services.NewAuthService(userDataSource, hasher, emailValidator), sessions, cookie),
		Users:          handlers.NewUserHandler(services.NewUserService(userDataSource)),
		Pages:          handlers.NewPagesHandler(services.NewPagesService(itemsDataSource)),
		Ops:            handlers.NewOpsHandler(services.NewOpsService(itemsDataSource, trashService)),
		Trash:          handlers.NewTrashHandler(trashService),
		Sessions:       sessions,
		Cookie:         cookie,
		AllowedOrigins: cfg.AllowedOrigins,
		EnableSwagger:  cfg.IsDevelopment(),
	})
	if err != nil {
		return err
	}

	addr := ":" + cfg.Port
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	log.Printf("listening on %s", addr)
	return serve(ctx, newHTTPServer(addr, router), ln, shutdownGrace)
}
