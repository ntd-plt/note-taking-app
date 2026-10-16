package main

import (
	"backend/internal/configs"
	"backend/internal/database"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"context"
	"log"
)

// @title           Note Taking App API
// @version         1.0
// @description     API for managing users and their items (notes and folders).
// @BasePath        /api/v1

// @securityDefinitions.apikey  BearerAuth
// @in                          header
// @name                        Authorization
// @description                 Type "Bearer" followed by a space and the JWT access token.

func main() {
	cfg, err := configs.Load()
	if err != nil {
		panic(err)
	}

	pool, err := database.NewPool(cfg)
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	userDataSource := database.NewPostgreUserDataSource(pool)
	itemsDataSource := database.NewPostgreItemsDataSource(pool)
	trashDataSource := database.NewPostgreTrashDataSource(pool)

	hasher := hash.NewBcryptHasher()
	tokenService := services.NewJWTService()

	var emailValidator services.EmailValidator
	if cfg.DisableEmailVerification {
		log.Println("email verification disabled via DISABLE_EMAIL_VERIFICATION")
		emailValidator = services.NoopEmailValidator{}
	} else {
		emailValidator = services.NewEmailValidator()
	}

	userService := services.NewUserService(userDataSource)
	authService := services.NewAuthService(userService, hasher, tokenService, emailValidator)
	itemsService := services.NewItemsService(itemsDataSource)
	trashService := services.NewTrashService(trashDataSource, cfg.TrashRetention)

	purgeCtx, stopPurge := context.WithCancel(context.Background())
	defer stopPurge()
	go trashService.RunPurger(purgeCtx)

	router := NewRouter(authService, userService, itemsService, trashService, tokenService, cfg.IsDevelopment())
	if err := router.Run(":8080"); err != nil {
		panic(err)
	}
}
