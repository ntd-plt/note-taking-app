package pkg

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

type SignupResponse struct {
	Name     string `json:"name" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

type AuthResponse struct {
	RefreshToken string `json:"token"`
	AccessToken  string `json:"access_token"`
}

type RefreshTokenRequest struct {
	Token string `json:"token" validate:"required"`
}

func NewLoginRequest(email, password string) *LoginRequest {
	return &LoginRequest{
		Email:    email,
		Password: password,
	}
}

func NewSignupResponse(name, email, password string) *SignupResponse {
	return &SignupResponse{
		Name:     name,
		Email:    email,
		Password: password,
	}
}

func NewAuthResponse(accessToken string, refreshToken string) *AuthResponse {
	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}
}

func NewRefreshTokenRequest(token string) *RefreshTokenRequest {
	return &RefreshTokenRequest{
		Token: token,
	}
}
