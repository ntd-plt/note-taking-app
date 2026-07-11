package main

import (
	"backend/internal/handlers"
	"backend/internal/middleware"
	"backend/internal/services"

	"github.com/gin-gonic/gin"
)

func NewRouter(authHandler *handlers.AuthHandler, notesHandler *handlers.NotesHandler, foldersHandler *handlers.FoldersHandler, tokenService *services.JWTService) *gin.Engine {
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
		protected.POST("/notes", notesHandler.CreateNote)
		protected.GET("/notes/:id", notesHandler.GetNote)
		protected.PUT("/notes", notesHandler.UpdateNotes)
		protected.DELETE("/notes", notesHandler.DeleteNotes)

		protected.GET("/folders", foldersHandler.GetFolders)
		protected.POST("/folders", foldersHandler.CreateFolder)
		protected.GET("/folders/:id", foldersHandler.GetFolder)
		protected.PUT("/folders", foldersHandler.UpdateFolders)
		protected.DELETE("/folders", foldersHandler.DeleteFolders)

	}
	return router
}
