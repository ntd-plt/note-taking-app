package main

import (
	"backend/internal/database"
	"backend/internal/handlers"
	"backend/internal/pkg/hash"
	"backend/internal/services"
)

func main() {
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

	router := NewRouter(authHandler, notesHandler, foldersHandler, tokenService)
	router.Run(":8080")
}
