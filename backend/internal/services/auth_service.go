package services

import (
	"backend/internal/errors"
	"backend/internal/pkg"
	"backend/internal/pkg/hash"
	"context"
	stderrors "errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// normalizeEmail trims whitespace and lowercases an email address so that
// lookups and storage treat e.g. "Bob@Example.com" and "bob@example.com" as
// the same address.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

type AuthService struct {
	userService    *UserService
	hasher         hash.Hasher
	tokenService   TokenService
	emailValidator EmailValidator
}

func NewAuthService(userService *UserService, hasher hash.Hasher, tokenService TokenService, emailValidator EmailValidator) *AuthService {
	return &AuthService{
		userService:    userService,
		hasher:         hasher,
		tokenService:   tokenService,
		emailValidator: emailValidator,
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
func (s *AuthService) Login(c *gin.Context) {
	var req pkg.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := s.login(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token.AccessToken, token.RefreshToken))
}

func (s *AuthService) Logout() error {
	return nil
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
// @Failure      422      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /auth/signup [post]
func (s *AuthService) Signup(c *gin.Context) {
	var req pkg.SignupResponse
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := s.signup(c.Request.Context(), req.Name, req.Email, req.Password)
	if err != nil {
		if stderrors.Is(err, errors.ErrEmailAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if stderrors.Is(err, errors.ErrInvalidEmailAddress) {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	token, err := s.login(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
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
func (s *AuthService) RefreshToken(c *gin.Context) {
	var req pkg.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := s.refreshToken(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pkg.NewAuthResponse(token, ""))
}

func (s *AuthService) login(email, password string) (*pkg.AuthResponse, error) {
	email = normalizeEmail(email)

	u, err := s.userService.GetUserByEmail(email)
	if err != nil {
		return nil, err
	}
	if err := s.hasher.Compare(u.PasswordHash, []byte(password)); err != nil {
		return nil, errors.ErrWrongPasswordOrEmail
	}

	accessToken, err := s.tokenService.GenerateAccessToken(u.ID)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.tokenService.GenerateRefreshToken(u.ID)
	if err != nil {
		return nil, err
	}

	return pkg.NewAuthResponse(accessToken, refreshToken), nil
}

func (s *AuthService) signup(ctx context.Context, name, email, password string) error {
	email = normalizeEmail(email)

	_, err := s.userService.GetUserByEmail(email)
	if err == nil {
		return errors.ErrEmailAlreadyExists
	}
	var notFoundError *pkg.NotFoundError
	if !stderrors.As(err, &notFoundError) {
		return err
	}

	result, verifyErr := s.emailValidator.Verify(ctx, email)
	if verifyErr == nil && (result.Classification == EmailVerificationUndeliverable || result.IsDisposable) {
		return errors.ErrInvalidEmailAddress
	}

	passwordHash, err := s.hasher.Hash([]byte(password))
	if err != nil {
		return err
	}

	if _, err := s.userService.CreateUser(name, email, passwordHash); err != nil {
		var alreadyExists *pkg.AlreadyExistsError
		if stderrors.As(err, &alreadyExists) {
			return errors.ErrEmailAlreadyExists
		}
		return err
	}

	return nil
}

func (s *AuthService) refreshToken(token string) (string, error) {
	userID, err := s.tokenService.ValidateRefreshToken(token)
	if err != nil {
		return "", err
	}

	accessToken, err := s.tokenService.GenerateAccessToken(userID)
	if err != nil {
		return "", err
	}

	return accessToken, nil
}
