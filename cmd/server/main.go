package server

import (
	"note-taking-app/internal/database"
	"note-taking-app/internal/handlers"
	"note-taking-app/internal/middleware"
	"note-taking-app/internal/pkg/hash"
	"note-taking-app/internal/services"

	"github.com/gin-gonic/gin"
)

func main() {
	db := database.NewPostgreDatabase()
	if err := db.Connect(); err != nil {
		panic(err)
	}

	defer db.Disconnect()

	hasher := hash.NewBcryptHasher()
	tokenService := services.NewJWTService()
	authService := services.NewAuthService(db, hasher)
	authHandler := handlers.New(authService, tokenService)

	router := gin.Default()
	authGroup := router.Group("/auth")
	{
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/signup", authHandler.Signup)
		authGroup.POST("/refresh-token", authHandler.RefreshToken)
	}

	protected := router.Group("/api")
	protected.Use(middleware.Auth(tokenService))
	{
		// protected.GET("/notes", notesHandler.GetNotes)
		// protected.POST("/notes", notesHandler.CreateNote)
	}
}
