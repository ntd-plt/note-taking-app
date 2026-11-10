package main

import (
	"backend/internal/handlers"
	"backend/internal/middleware"
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
	Auth     *handlers.AuthHandler
	Users    *handlers.UserHandler
	Pages    *handlers.PagesHandler
	Ops      *handlers.OpsHandler
	Trash    *handlers.TrashHandler
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

		protected.GET("/items/:id", d.Pages.GetItem)
		protected.POST("/items/:id/duplicate", d.Ops.DuplicateItem)
		protected.GET("/workspace", d.Pages.GetWorkspace)
		protected.GET("/pages", d.Pages.ListPages)
		protected.POST("/ops", d.Ops.ApplyOps)

		protected.GET("/trash", d.Trash.ListTrash)
		protected.DELETE("/trash", d.Trash.EmptyTrash)
		protected.POST("/trash/:id/restore", d.Trash.RestoreFromTrash)
		protected.DELETE("/trash/:id", d.Trash.DeleteFromTrash)
	}
	return router, nil
}
