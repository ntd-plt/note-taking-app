package handlers

import (
	"net/http"
	"time"

	"backend/internal/model"
	"backend/internal/services"

	"github.com/gin-gonic/gin"
)

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

// UpdateUserRequest changes the name. Email is read only to refuse it.
type UpdateUserRequest struct {
	Name  *string `json:"name"`
	Email *string `json:"email" swaggerignore:"true"`
}

type UserHandler struct {
	users userService
}

func NewUserHandler(users userService) *UserHandler {
	return &UserHandler{users: users}
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
func (h *UserHandler) GetUser(c *gin.Context) {
	id, ok := currentUser(c)
	if !ok {
		return
	}
	user, err := h.users.Get(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, newUserResponse(user))
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
func (h *UserHandler) UpdateUser(c *gin.Context) {
	id, ok := currentUser(c)
	if !ok {
		return
	}
	var req UpdateUserRequest
	if !decode(c, &req) {
		return
	}
	if req.Email != nil {
		writeError(c, services.ErrEmailChangeDisabled)
		return
	}
	var (
		user model.User
		err  error
	)
	if req.Name != nil {
		user, err = h.users.Rename(c.Request.Context(), id, *req.Name)
	} else {
		user, err = h.users.Get(c.Request.Context(), id)
	}
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, newUserResponse(user))
}
