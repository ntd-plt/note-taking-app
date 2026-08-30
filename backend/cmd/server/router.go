package main

import (
	"backend/internal/middleware"
	"backend/internal/services"

	_ "backend/docs"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func NewRouter(authService *services.AuthService, notesService *services.NotesService, foldersService *services.FoldersService, tokenService *services.JWTService, enableSwagger bool) *gin.Engine {
	router := gin.Default()

	router.Use(middleware.CORS())

	if enableSwagger {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	authGroup := router.Group("/auth")
	{
		authGroup.POST("/login", authService.Login)
		authGroup.POST("/signup", authService.Signup)
		authGroup.POST("/refresh-token", authService.RefreshToken)
	}

	protected := router.Group("/api")
	protected.Use(middleware.Auth(tokenService))
	{
		protected.GET("/notes", notesService.GetNotes)
		protected.POST("/notes", notesService.CreateNote)
		protected.GET("/notes/:id", notesService.GetNote)
		protected.PUT("/notes", notesService.UpdateNotes)
		protected.DELETE("/notes", notesService.DeleteNotes)

		protected.GET("/folders", foldersService.GetFolders)
		protected.POST("/folders", foldersService.CreateFolder)
		protected.GET("/folders/:id", foldersService.GetFolder)
		protected.PUT("/folders", foldersService.UpdateFolders)
		protected.DELETE("/folders", foldersService.DeleteFolders)

	}
	return router
}
