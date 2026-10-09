package services

import (
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"
	stderrors "errors"
	"net/http"
	"strings"
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

func (s *UserService) GetUserByEmail(email string) (model.User, error) {
	return s.db.GetUserByEmail(email)
}

func (s *UserService) GetUserByID(id uuid.UUID) (model.User, error) {
	return s.db.GetUserByID(id)
}

func (s *UserService) CreateUser(name, email string, passwordHash []byte) (model.User, error) {
	newUser := model.New().WithEmail(email).WithPasswordHash(passwordHash).WithUsername(name)
	if err := s.db.AddUser(*newUser); err != nil {
		return model.User{}, err
	}
	return *newUser, nil
}

// GetUser godoc
// @Summary      Get the current user
// @Description  Returns the authenticated user's profile (never includes the password hash)
// @Tags         users
// @Produce      json
// @Security     BearerAuth
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

	user, err := s.db.GetUserByID(id)
	if err != nil {
		var notFound *pkg.NotFoundError
		if stderrors.As(err, &notFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, newUserResponse(user))
}

// UpdateUserRequest is a partial update: only the fields present in the JSON
// body are changed. The password hash cannot be updated through this route.
type UpdateUserRequest struct {
	Name  *string `json:"name"`
	Email *string `json:"email"`
}

// UpdateUser godoc
// @Summary      Update the current user
// @Description  Updates the authenticated user's own profile (name and/or email). Partial update: omitted fields are left unchanged.
// @Tags         users
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      UpdateUserRequest  true  "Fields to update"
// @Success      200      {object}  UserResponse
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      409      {object}  map[string]string
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

	user, err := s.db.GetUserByID(id)
	if err != nil {
		var notFound *pkg.NotFoundError
		if stderrors.As(err, &notFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
			return
		}
		user.Name = name
	}
	if req.Email != nil {
		email := normalizeEmail(*req.Email)
		if email == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email cannot be empty"})
			return
		}
		user.Email = email
	}

	if err := s.db.UpdateUser(user); err != nil {
		var alreadyExists *pkg.AlreadyExistsError
		if stderrors.As(err, &alreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		var notFound *pkg.NotFoundError
		if stderrors.As(err, &notFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	// Re-read so the response carries the persisted updated_at.
	updated, err := s.db.GetUserByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, newUserResponse(updated))
}
