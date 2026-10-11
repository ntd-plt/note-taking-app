package main

import (
	"backend/internal/middleware"
	"backend/internal/services"

	_ "backend/docs"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

const maxRequestBodyBytes = 2 << 20

func NewRouter(authService *services.AuthService, userService *services.UserService, itemsService *services.ItemsService, tokenService *services.JWTService, enableSwagger bool) *gin.Engine {
	router := gin.Default()

	router.Use(middleware.CORS())
	router.Use(middleware.MaxBodyBytes(maxRequestBodyBytes))

	if enableSwagger {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	v1 := router.Group("/api/v1")

	authGroup := v1.Group("/auth")
	{
		authGroup.POST("/login", authService.Login)
		authGroup.POST("/signup", authService.Signup)
		authGroup.POST("/refresh-token", authService.RefreshToken)
	}

	protected := v1.Group("")
	protected.Use(middleware.Auth(tokenService))
	{
		protected.GET("/users/me", userService.GetUser)
		protected.PUT("/users/me", userService.UpdateUser)

		protected.POST("/items", itemsService.CreateItem)
		protected.GET("/items", itemsService.ListItems)
		protected.PATCH("/items", itemsService.MoveItems)
		protected.GET("/items/:id", itemsService.GetItem)
		protected.PATCH("/items/:id", itemsService.UpdateItem)
		protected.DELETE("/items/:id", itemsService.DeleteItem)
		protected.GET("/items/:id/content", itemsService.GetNoteContent)
		protected.PUT("/items/:id/content", itemsService.PutNoteContent)
	}
	return router
}
