package main

import (
	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/handlers"
	"backend/internal/pkg/hash"
	"backend/internal/services"
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
	authService := services.NewAuthService(db, hasher)

	tokenService := services.NewJWTService()
	authHandler := handlers.New(authService, tokenService)
	notesHandler := handlers.NewNotesHandler(db, tokenService)
	foldersHandler := handlers.NewFoldersHandler(db, tokenService)

	router := NewRouter(authHandler, notesHandler, foldersHandler, tokenService, !cfg.IsProduction())
	router.Run(":8080")
}
