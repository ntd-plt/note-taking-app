package handlers

import (
	"context"
	"log"
	"net/http"

	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/session"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AuthSessions starts and ends login sessions.
type AuthSessions interface {
	Create(ctx context.Context, userID uuid.UUID, userAgent string) (string, session.Session, error)
	Delete(ctx context.Context, id string) error
	DeleteAllForUser(ctx context.Context, userID uuid.UUID) error
	PurgeExpired(ctx context.Context, userID uuid.UUID) error
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// SignupRequest only requires its fields; the service checks the account rules.
type SignupRequest struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type AuthHandler struct {
	auth     *services.AuthService
	sessions AuthSessions
	cookie   session.Cookie
}

func NewAuthHandler(auth *services.AuthService, sessions AuthSessions, cookie session.Cookie) *AuthHandler {
	return &AuthHandler{auth: auth, sessions: sessions, cookie: cookie}
}

// Login godoc
// @Summary      Log in
// @Description  Checks the email and password, starts a session and sets it in the sid cookie (HttpOnly, SameSite=Lax). Returns the user.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      LoginRequest  true  "Login credentials"
// @Success      200      {object}  UserResponse
// @Header       200      {string}  Set-Cookie  "sid=<session id>"
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string  "wrong email or password, the same for an unknown email"
// @Failure      403      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if !decode(c, &req) {
		return
	}
	user, err := h.auth.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	if !h.startSession(c, user) {
		return
	}
	c.JSON(http.StatusOK, newUserResponse(user))
}

// Signup godoc
// @Summary      Sign up
// @Description  Creates an account, starts a session and sets it in the sid cookie (HttpOnly, SameSite=Lax). Returns the new user. The name is trimmed and must be 1 to 50 characters; the password must be 6 to 72 bytes; the email must be a valid, deliverable address.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      SignupRequest  true  "Signup details"
// @Success      201      {object}  UserResponse
// @Header       201      {string}  Set-Cookie  "sid=<session id>"
// @Failure      400      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      409      {object}  map[string]string
// @Failure      422      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /auth/signup [post]
func (h *AuthHandler) Signup(c *gin.Context) {
	var req SignupRequest
	if !decode(c, &req) {
		return
	}
	user, err := h.auth.Signup(c.Request.Context(), req.Name, req.Email, req.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	if !h.startSession(c, user) {
		return
	}
	c.JSON(http.StatusCreated, newUserResponse(user))
}

// Logout godoc
// @Summary      Log out
// @Description  Ends the session in the sid cookie and clears the cookie. Succeeds without a session too.
// @Tags         auth
// @Success      204  "No Content"
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	h.cookie.Clear(c.Writer)
	if id := h.cookie.Read(c.Request); id != "" {
		if err := h.sessions.Delete(c.Request.Context(), id); err != nil {
			writeError(c, err)
			return
		}
	}
	c.Status(http.StatusNoContent)
}

// LogoutAll godoc
// @Summary      Log out of all devices
// @Description  Ends every session of the logged-in user, on every device, and clears the sid cookie.
// @Tags         auth
// @Success      204  "No Content"
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Security     SessionCookie
// @Router       /auth/logout-all [post]
func (h *AuthHandler) LogoutAll(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	if err := h.sessions.DeleteAllForUser(c.Request.Context(), userID); err != nil {
		writeError(c, err)
		return
	}
	h.cookie.Clear(c.Writer)
	c.Status(http.StatusNoContent)
}

// startSession ends the browser's previous session, so every login gets a fresh
// id, then sets the new one in the cookie. It reports false after writing an error.
func (h *AuthHandler) startSession(c *gin.Context, user model.User) bool {
	ctx := c.Request.Context()
	if old := h.cookie.Read(c.Request); old != "" {
		if err := h.sessions.Delete(ctx, old); err != nil {
			log.Printf("ending the previous session: %v", err)
		}
	}
	if err := h.sessions.PurgeExpired(ctx, user.ID); err != nil {
		log.Printf("purging the expired sessions of %s: %v", user.ID, err)
	}
	id, _, err := h.sessions.Create(ctx, user.ID, c.Request.UserAgent())
	if err != nil {
		writeError(c, err)
		return false
	}
	h.cookie.Set(c.Writer, id)
	return true
}
