package model

type Item struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"` // "note" or "folder"
}
