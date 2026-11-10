package main

import (
	"backend/internal/middleware"
	"backend/internal/services"
	"backend/internal/session"

	_ "backend/docs"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

const maxRequestBodyBytes = 2 << 20

// requestDeadline is the longest a request may work before its context is
// canceled. It matches the server's write timeout.
const requestDeadline = writeTimeout

// RouterDeps is what the HTTP routes are built from.
type RouterDeps struct {
	Auth     *services.AuthService
	Users    *services.UserService
	Items    *services.ItemsService
	Sessions middleware.SessionLookup
	Cookie   session.Cookie
	// AllowedOrigins may call the API cross-origin with the session cookie.
	AllowedOrigins []string
	EnableSwagger  bool
}

func NewRouter(d RouterDeps) (*gin.Engine, error) {
	csrf, err := middleware.CSRF(d.AllowedOrigins)
	if err != nil {
		return nil, err
	}

	router := gin.Default()
	router.Use(middleware.CORS(d.AllowedOrigins))
	router.Use(csrf)
	router.Use(middleware.MaxBodyBytes(maxRequestBodyBytes))
	router.Use(middleware.Deadline(requestDeadline))

	if d.EnableSwagger {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	v1 := router.Group("/api/v1")

	authGroup := v1.Group("/auth")
	{
		authGroup.POST("/login", d.Auth.Login)
		authGroup.POST("/signup", d.Auth.Signup)
		authGroup.POST("/logout", d.Auth.Logout)
	}

	protected := v1.Group("")
	protected.Use(middleware.RequireSession(d.Sessions, d.Cookie))
	{
		protected.POST("/auth/logout-all", d.Auth.LogoutAll)

		protected.GET("/users/me", d.Users.GetUser)
		protected.PUT("/users/me", d.Users.UpdateUser)

		protected.GET("/items/:id", d.Items.GetItem)
		protected.POST("/items/:id/duplicate", d.Items.DuplicateItem)
		protected.GET("/workspace", d.Items.GetWorkspace)
		protected.GET("/pages", d.Items.ListPages)
		protected.POST("/ops", d.Items.ApplyOps)

		protected.GET("/trash", d.Items.ListTrash)
		protected.DELETE("/trash", d.Items.EmptyTrash)
		protected.POST("/trash/:id/restore", d.Items.RestoreFromTrash)
		protected.DELETE("/trash/:id", d.Items.DeleteFromTrash)
	}
	return router, nil
}
