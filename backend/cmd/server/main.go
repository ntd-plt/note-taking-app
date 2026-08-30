package main

import (
	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"log"
)

// @title           Note Taking App API
// @version         1.0
// @description     API for managing users, notes, and folders.
// @BasePath        /

// @securityDefinitions.apikey  BearerAuth
// @in                          header
// @name                        Authorization
// @description                 Type "Bearer" followed by a space and the JWT access token.

func main() {
	cfg, err := configs.Load()
	if err != nil {
		panic(err)
	}

	pool, err := database.NewPool(cfg)
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	userDataSource := database.NewPostgreUserDataSource(pool)
	notesDataSource := database.NewPostgreNotesDataSource(pool)
	foldersDataSource := database.NewPostgreFoldersDataSource(pool)

	hasher := hash.NewBcryptHasher()
	tokenService := services.NewJWTService()

	var emailValidator services.EmailValidator
	if cfg.DisableEmailVerification {
		log.Println("email verification disabled via DISABLE_EMAIL_VERIFICATION")
		emailValidator = services.NoopEmailValidator{}
	} else {
		emailValidator = services.NewEmailValidator()
	}

	userService := services.NewUserService(userDataSource)
	authService := services.NewAuthService(userService, hasher, tokenService, emailValidator)
	notesService := services.NewNotesService(notesDataSource)
	foldersService := services.NewFoldersService(foldersDataSource)

	router := NewRouter(authService, notesService, foldersService, tokenService, !cfg.IsProduction())
	if err := router.Run(":8080"); err != nil {
		panic(err)
	}
}
