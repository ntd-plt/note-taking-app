package main

import (
	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/handlers"
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

	db := database.NewPostgreDatabase()
	if err := db.Connect(); err != nil {
		panic(err)
	}

	defer db.Disconnect()

	hasher := hash.NewBcryptHasher()
	tokenService := services.NewJWTService()

	var emailValidator services.EmailValidator
	if cfg.DisableEmailVerification {
		log.Println("email verification disabled via DISABLE_EMAIL_VERIFICATION")
		emailValidator = services.NoopEmailValidator{}
	} else {
		emailValidator = services.NewEmailValidator()
	}

	authService := services.NewAuthService(db, hasher, tokenService, emailValidator)
	authHandler := handlers.NewAuthHandler(authService)
	notesHandler := handlers.NewNotesHandler(db)
	foldersHandler := handlers.NewFoldersHandler(db)

	router := NewRouter(authHandler, notesHandler, foldersHandler, tokenService, !cfg.IsProduction())
	router.Run(":8080")
}
