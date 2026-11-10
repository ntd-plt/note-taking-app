package main

import (
	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"backend/internal/session"
	"context"
	"log"
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
	cfg, err := configs.Load()
	if err != nil {
		panic(err)
	}

	pool, err := database.NewPool(context.Background(), cfg.DSN())
	if err != nil {
		panic(err)
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

	userService := services.NewUserService(userDataSource)
	authService := services.NewAuthService(userService, hasher, emailValidator, sessions, cookie)
	itemsService := services.NewItemsService(itemsDataSource, cfg.TrashRetention)

	router, err := NewRouter(RouterDeps{
		Auth:           authService,
		Users:          userService,
		Items:          itemsService,
		Sessions:       sessions,
		Cookie:         cookie,
		AllowedOrigins: cfg.AllowedOrigins,
		EnableSwagger:  cfg.IsDevelopment(),
	})
	if err != nil {
		panic(err)
	}
	if err := router.Run(":8080"); err != nil {
		panic(err)
	}
}
