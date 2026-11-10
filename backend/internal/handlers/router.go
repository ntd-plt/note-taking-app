package handlers

import (
	"backend/internal/middleware"
	"backend/internal/session"
	"time"

	_ "backend/docs"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

const maxRequestBodyBytes = 2 << 20

// RouterDeps is what the HTTP routes are built from.
type RouterDeps struct {
	Auth     *AuthHandler
	Users    *UserHandler
	Pages    *PagesHandler
	Ops      *OpsHandler
	Trash    *TrashHandler
	Sessions middleware.SessionLookup
	Cookie   session.Cookie
	// AllowedOrigins may call the API cross-origin with the session cookie.
	AllowedOrigins []string
	// RequestDeadline caps how long one request may work; zero means no cap.
	RequestDeadline time.Duration
	EnableSwagger   bool
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
	if d.RequestDeadline > 0 {
		router.Use(middleware.Deadline(d.RequestDeadline))
	}

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
