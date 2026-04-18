package handlers

import (
	"net/http"

	"note-taking-app/internal/pkg"
	"note-taking-app/internal/services"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authService  *services.AuthService
	tokenService *services.JWTService
}

func New(authService *services.AuthService, tokenService *services.JWTService) *AuthHandler {
	return &AuthHandler{
		authService:  authService,
		tokenService: tokenService,
	}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req pkg.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Login(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token))
}

func (h *AuthHandler) Logout() {
}

func (h *AuthHandler) Signup(c *gin.Context) {
	if err := c.ShouldBindJSON(&req); err != nil {
		var req pkg.SignupResponse
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Signup(req.Name, req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token))
}

func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req pkg.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.tokenService.RefreshToken(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token))
}
