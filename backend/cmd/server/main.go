package server

import (
	"backend/internal/database"
	"backend/internal/handlers"
	"backend/internal/middleware"
	"backend/internal/pkg/hash"
	"backend/internal/services"

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
	notesHandler := handlers.NewNotesHandler(db, tokenService)

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
		protected.GET("/notes", notesHandler.GetNotes)
		protected.POST("/notes", notesHandler.CreateNote)
		protected.GET("/notes/:id", notesHandler.GetNote)
		protected.PUT("/notes/:id", notesHandler.UpdateNote)
		protected.DELETE("/notes/:id", notesHandler.DeleteNote)
	}
}
