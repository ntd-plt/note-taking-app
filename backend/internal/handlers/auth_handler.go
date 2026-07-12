package handlers

import (
	stderrors "errors"
	"net/http"

	"backend/internal/errors"
	"backend/internal/pkg"
	"backend/internal/services"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(authService *services.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// Login godoc
// @Summary      Log in
// @Description  Authenticates a user and returns access/refresh tokens
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      pkg.LoginRequest  true  "Login credentials"
// @Success      200      {object}  pkg.AuthResponse
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Router       /auth/login [post]
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

// Signup godoc
// @Summary      Sign up
// @Description  Creates a new user account and returns access/refresh tokens
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      pkg.SignupResponse  true  "Signup details"
// @Success      200      {object}  pkg.AuthResponse
// @Failure      400      {object}  map[string]string
// @Failure      409      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /auth/signup [post]
func (h *AuthHandler) Signup(c *gin.Context) {
	var req pkg.SignupResponse
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.authService.Signup(req.Name, req.Email, req.Password)
	if err != nil {
		if stderrors.Is(err, errors.ErrEmailAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
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

// RefreshToken godoc
// @Summary      Refresh access token
// @Description  Exchanges a refresh token for a new access token
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      pkg.RefreshTokenRequest  true  "Refresh token"
// @Success      200      {object}  pkg.AuthResponse
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Router       /auth/refresh-token [post]
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
