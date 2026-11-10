package services

import (
	"backend/internal/database"
	"backend/internal/model"
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UserService struct {
	db database.UserDataSource
}

type UserResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func newUserResponse(u model.User) UserResponse {
	return UserResponse{
		ID:        u.ID.String(),
		Name:      u.Name,
		Email:     u.Email,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
		UpdatedAt: u.UpdatedAt.Format(time.RFC3339),
	}
}

func NewUserService(db database.UserDataSource) *UserService {
	return &UserService{db: db}
}

func (s *UserService) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
	return s.db.GetUserByEmail(ctx, email)
}

func (s *UserService) GetUserByID(ctx context.Context, id uuid.UUID) (model.User, error) {
	return s.db.GetUserByID(ctx, id)
}

func (s *UserService) CreateUser(ctx context.Context, name, email string, passwordHash []byte) (model.User, error) {
	newUser := model.New().WithEmail(email).WithPasswordHash(passwordHash).WithUsername(name)
	if err := s.db.AddUser(ctx, *newUser); err != nil {
		return model.User{}, err
	}
	return *newUser, nil
}

// GetUser godoc
// @Summary      Get the current user
// @Description  Returns the authenticated user's profile (never includes the password hash)
// @Tags         users
// @Produce      json
// @Security     SessionCookie
// @Success      200  {object}  UserResponse
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /users/me [get]
func (s *UserService) GetUser(c *gin.Context) {
	id, ok := currentUser(c)
	if !ok {
		return
	}

	user, err := s.db.GetUserByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}

	c.JSON(http.StatusOK, newUserResponse(user))
}

// UpdateUserRequest changes the user's name; omitting it changes nothing. The
// email cannot be changed yet: that waits for a flow that confirms the new
// address, so a request carrying "email" is refused rather than ignored.
type UpdateUserRequest struct {
	Name  *string `json:"name"`
	Email *string `json:"email" swaggerignore:"true"`
}

// UpdateUser godoc
// @Summary      Update the current user
// @Description  Changes the logged-in user's name: trimmed, 1 to 50 characters. The email cannot be changed yet; a body with "email" gets 400.
// @Tags         users
// @Accept       json
// @Produce      json
// @Security     SessionCookie
// @Param        request  body      UpdateUserRequest  true  "Fields to update"
// @Success      200      {object}  UserResponse
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /users/me [put]
func (s *UserService) UpdateUser(c *gin.Context) {
	id, ok := currentUser(c)
	if !ok {
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Email != nil {
		writeError(c, ErrEmailChangeDisabled)
		return
	}
	var name string
	if req.Name != nil {
		var err error
		if name, err = CheckName(*req.Name); err != nil {
			writeError(c, err)
			return
		}
	}

	user, err := s.db.GetUserByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}

	if req.Name != nil {
		user.Name = name
	}

	if err := s.db.UpdateUser(c.Request.Context(), user); err != nil {
		writeError(c, err)
		return
	}

	// Re-read so the response carries the persisted updated_at.
	updated, err := s.db.GetUserByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}

	c.JSON(http.StatusOK, newUserResponse(updated))
}
