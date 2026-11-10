package database_test

import (
	"backend/internal/database"
	"backend/internal/services"
	"backend/internal/session"
)

var (
	_ services.UserStore  = (*database.PostgreUserDataSource)(nil)
	_ services.PageReader = (*database.PostgreItemsDataSource)(nil)
	_ services.TreeWriter = (*database.PostgreItemsDataSource)(nil)
	_ services.TrashStore = (*database.PostgreItemsDataSource)(nil)
	_ session.Store       = (*database.PostgreSessionStore)(nil)
)
