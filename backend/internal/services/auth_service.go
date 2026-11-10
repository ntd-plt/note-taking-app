package services

import (
	"backend/internal/apperr"
	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/pkg/hash"
	"backend/internal/session"
	"context"
	"log"
	"net/http"
	"sync"

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

type AuthService struct {
	userService    *UserService
	hasher         hash.Hasher
	emailValidator EmailValidator
	sessions       AuthSessions
	cookie         session.Cookie

	// dummyHash is compared against when a login names an unknown email, so
	// that path costs one bcrypt comparison too and the response time does not
	// tell whether an account exists. It is made once, by the same hasher, so it
	// has the same cost as real hashes.
	dummyOnce sync.Once
	dummy     []byte
}

func NewAuthService(userService *UserService, hasher hash.Hasher, emailValidator EmailValidator, sessions AuthSessions, cookie session.Cookie) *AuthService {
	return &AuthService{
		userService:    userService,
		hasher:         hasher,
		emailValidator: emailValidator,
		sessions:       sessions,
		cookie:         cookie,
	}
}

// Login godoc
// @Summary      Log in
// @Description  Checks the email and password, starts a session and sets it in the sid cookie (HttpOnly, SameSite=Lax). Returns the user.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      pkg.LoginRequest  true  "Login credentials"
// @Success      200      {object}  UserResponse
// @Header       200      {string}  Set-Cookie  "sid=<session id>"
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string  "wrong email or password, the same for an unknown email"
// @Failure      403      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /auth/login [post]
func (s *AuthService) Login(c *gin.Context) {
	var req pkg.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := s.login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	if !s.startSession(c, user) {
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
// @Param        request  body      pkg.SignupRequest  true  "Signup details"
// @Success      201      {object}  UserResponse
// @Header       201      {string}  Set-Cookie  "sid=<session id>"
// @Failure      400      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      409      {object}  map[string]string
// @Failure      422      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /auth/signup [post]
func (s *AuthService) Signup(c *gin.Context) {
	var req pkg.SignupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := s.signup(c.Request.Context(), req.Name, req.Email, req.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	if !s.startSession(c, user) {
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
func (s *AuthService) Logout(c *gin.Context) {
	s.cookie.Clear(c.Writer)
	if id := s.cookie.Read(c.Request); id != "" {
		if err := s.sessions.Delete(c.Request.Context(), id); err != nil {
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
func (s *AuthService) LogoutAll(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	if err := s.sessions.DeleteAllForUser(c.Request.Context(), userID); err != nil {
		writeError(c, err)
		return
	}
	s.cookie.Clear(c.Writer)
	c.Status(http.StatusNoContent)
}

// startSession logs the user in on this browser: it ends the session the browser
// already had, if any, so every login gets a fresh id, then sets the new one in the
// cookie. It reports false after writing an error response.
func (s *AuthService) startSession(c *gin.Context, user model.User) bool {
	ctx := c.Request.Context()
	if old := s.cookie.Read(c.Request); old != "" {
		if err := s.sessions.Delete(ctx, old); err != nil {
			log.Printf("ending the previous session: %v", err)
		}
	}
	if err := s.sessions.PurgeExpired(ctx, user.ID); err != nil {
		log.Printf("purging the expired sessions of %s: %v", user.ID, err)
	}
	id, _, err := s.sessions.Create(ctx, user.ID, c.Request.UserAgent())
	if err != nil {
		writeError(c, err)
		return false
	}
	s.cookie.Set(c.Writer, id)
	return true
}

// login returns ErrWrongPasswordOrEmail alike for an unknown email and a wrong
// password, after the same amount of work, so neither the answer nor its timing
// tells whether the account exists.
func (s *AuthService) login(ctx context.Context, email, password string) (model.User, error) {
	u, err := s.userService.GetUserByEmail(ctx, NormalizeEmail(email))
	if apperr.Is(err, apperr.NotFound) {
		_ = s.hasher.Compare(s.dummyHash(), []byte(password))
		return model.User{}, ErrWrongPasswordOrEmail
	}
	if err != nil {
		return model.User{}, err
	}
	if err := s.hasher.Compare(u.PasswordHash, []byte(password)); err != nil {
		return model.User{}, ErrWrongPasswordOrEmail
	}
	return u, nil
}

func (s *AuthService) dummyHash() []byte {
	s.dummyOnce.Do(func() {
		h, err := s.hasher.Hash([]byte("not-a-real-password"))
		if err != nil {
			log.Printf("making the dummy password hash: %v", err)
			return
		}
		s.dummy = h
	})
	return s.dummy
}

func (s *AuthService) signup(ctx context.Context, rawName, rawEmail, password string) (model.User, error) {
	name, err := CheckName(rawName)
	if err != nil {
		return model.User{}, err
	}
	if err := CheckPassword(password); err != nil {
		return model.User{}, err
	}
	email, err := CheckEmailFormat(rawEmail)
	if err != nil {
		return model.User{}, err
	}

	_, err = s.userService.GetUserByEmail(ctx, email)
	if err == nil {
		return model.User{}, ErrEmailAlreadyExists
	}
	if !apperr.Is(err, apperr.NotFound) {
		return model.User{}, err
	}

	if err := checkEmailDeliverable(ctx, s.emailValidator, email); err != nil {
		return model.User{}, err
	}

	passwordHash, err := s.hasher.Hash([]byte(password))
	if err != nil {
		return model.User{}, err
	}

	user, err := s.userService.CreateUser(ctx, name, email, passwordHash)
	if err != nil {
		if apperr.Is(err, apperr.Conflict) {
			return model.User{}, ErrEmailAlreadyExists
		}
		return model.User{}, err
	}
	return user, nil
}
