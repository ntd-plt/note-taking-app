package handlers

import (
	"backend/internal/pkg"
	"backend/internal/services"
	"net/http"

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

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token.AccessToken, token.RefreshToken))
}

func (h *AuthHandler) Logout() {
}

func (h *AuthHandler) Signup(c *gin.Context) {
	var req pkg.SignupResponse
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.authService.Signup(req.Name, req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Login(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token.AccessToken, token.RefreshToken))
}

func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req pkg.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.RefreshToken(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token, ""))
}
