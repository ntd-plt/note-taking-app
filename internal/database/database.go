package database

import user "note-taking-app/internal/model"

type Database interface {
	Connect() error
	Disconnect() error
	GetUserByEmail(email string) (user.User, error)
	GetUserByID(id int) (user.User, error)
	AddUser(user user.User) error
}
