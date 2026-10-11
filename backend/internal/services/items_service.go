package services

import (
	"bytes"
	"encoding/json"
	stderrors "errors"
	"io"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ItemsService struct {
	db database.ItemsDataSource
}

func NewItemsService(db database.ItemsDataSource) *ItemsService {
	return &ItemsService{db: db}
}

type CreateItemRequest struct {
	ID         uuid.UUID      `json:"id"` // optional, if not provided, a new UUID will be generated
	Type       model.ItemType `json:"type" enums:"note,folder"`
	Name       string         `json:"name"`
	ParentID   *uuid.UUID     `json:"parent_id"`
	Icon       string         `json:"icon"`
	IsFavorite bool           `json:"is_favorite"`
	Content    *string        `json:"content"`
}

type UpdateItemRequest struct {
	Name       *string `json:"name"`
	Icon       *string `json:"icon"`
	IsFavorite *bool   `json:"is_favorite"`
}

type MoveItemsRequest struct {
	Items []MoveItemEntry `json:"items"`
}

type PutContentRequest struct {
	Content *string `json:"content"`
}

func isNotFound(err error) bool {
	var nf *pkg.NotFoundError
	return stderrors.As(err, &nf)
}

func internalErr(err error) *RequestError {
	log.Printf("internal error: %v", err)
	return &RequestError{Status: http.StatusInternalServerError, Message: "internal server error"}
}

func respondError(c *gin.Context, err error) {
	var re *RequestError
	var exists *pkg.AlreadyExistsError
	switch {
	case stderrors.As(err, &re):
		c.JSON(re.Status, gin.H{"error": re.Message})
	case isNotFound(err):
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
	case stderrors.As(err, &exists):
		c.JSON(http.StatusConflict, gin.H{"error": "item already exists"})
	case stderrors.Is(err, database.ErrInvalidParent):
		c.JSON(http.StatusBadRequest, gin.H{"error": database.ErrInvalidParent.Error()})
	case stderrors.Is(err, database.ErrTooDeep):
		c.JSON(http.StatusBadRequest, gin.H{"error": database.ErrTooDeep.Error()})
	case stderrors.Is(err, database.ErrNotANote):
		c.JSON(http.StatusBadRequest, gin.H{"error": database.ErrNotANote.Error()})
	case stderrors.Is(err, database.ErrMoveConflict):
		c.JSON(http.StatusConflict, gin.H{"error": database.ErrMoveConflict.Error()})
	default:
		log.Printf("internal error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

func currentUser(c *gin.Context) (uuid.UUID, bool) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return uuid.Nil, false
	}
	return userID.(uuid.UUID), true
}

func itemIDParam(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return uuid.Nil, false
	}
	return id, true
}

func decodeBody(c *gin.Context, dst any) *RequestError {
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooBig *http.MaxBytesError
		if stderrors.As(err, &tooBig) {
			return requestErr(http.StatusRequestEntityTooLarge, "request body is too large")
		}
		return requestErr(http.StatusBadRequest, "invalid request body: %s", err.Error())
	}
	if dec.More() {
		return requestErr(http.StatusBadRequest, "invalid request body: unexpected data after the JSON value")
	}
	return nil
}

func validateName(name string) (string, *RequestError) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", requestErr(http.StatusBadRequest, "name is required")
	}
	if utf8.RuneCountInString(name) > MaxNameLength {
		return "", requestErr(http.StatusBadRequest, "name must be at most %d characters", MaxNameLength)
	}
	return name, nil
}

func validateIcon(icon string) *RequestError {
	if utf8.RuneCountInString(icon) > MaxIconLength {
		return requestErr(http.StatusBadRequest, "icon must be at most %d characters", MaxIconLength)
	}
	return nil
}

// CreateItem godoc
// @Summary      Create or duplicate an item
// @Description  Creates a note or a folder, optionally inside a folder. With the cloneFromId query parameter it instead duplicates that item (and, for a folder, everything inside it) next to the original, named "Name (Copy N)"; the request body must then be empty. Duplicating is atomic.
// @Tags         items
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        cloneFromId  query     string             false  "Id of the item to duplicate. When set, the body must be empty."
// @Param        request      body      CreateItemRequest  false  "Item to create"
// @Success      201          {object}  model.Item
// @Failure      400          {object}  map[string]string
// @Failure      401          {object}  map[string]string
// @Failure      404          {object}  map[string]string
// @Failure      409          {object}  map[string]string
// @Failure      413          {object}  map[string]string
// @Failure      500          {object}  map[string]string
// @Router       /items [post]
func (s *ItemsService) CreateItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	if raw, ok := c.GetQuery("cloneFromId"); ok {
		s.duplicate(c, userID, raw)
		return
	}

	var req CreateItemRequest
	if err := decodeBody(c, &req); err != nil {
		respondError(c, err)
		return
	}
	if !req.Type.Valid() {
		respondError(c, requestErr(http.StatusBadRequest, "type must be %q or %q", model.ItemTypeNote, model.ItemTypeFolder))
		return
	}
	name, rerr := validateName(req.Name)
	if rerr != nil {
		respondError(c, rerr)
		return
	}
	if rerr := validateIcon(req.Icon); rerr != nil {
		respondError(c, rerr)
		return
	}
	content := ""
	if req.Content != nil {
		if req.Type != model.ItemTypeNote {
			respondError(c, requestErr(http.StatusBadRequest, "only notes have content"))
			return
		}
		if len(*req.Content) > MaxContentBytes {
			respondError(c, requestErr(http.StatusRequestEntityTooLarge, "content must be at most %d bytes", MaxContentBytes))
			return
		}
		content = *req.Content
	}
	if rerr := s.checkParent(userID, req.ParentID); rerr != nil {
		respondError(c, rerr)
		return
	}

	icon := req.Icon
	if icon == "" {
		icon = defaultIcon(req.Type)
	}
	created, err := s.db.CreateItem(model.Item{
		ID:         req.ID,
		UserID:     userID,
		ParentID:   req.ParentID,
		Type:       req.Type,
		Name:       name,
		Icon:       icon,
		IsFavorite: req.IsFavorite,
	}, content)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, created)
}

func (s *ItemsService) duplicate(c *gin.Context, userID uuid.UUID, rawID string) {
	sourceID, err := uuid.Parse(rawID)
	if err != nil {
		respondError(c, requestErr(http.StatusBadRequest, "cloneFromId must be a valid item id"))
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		var tooBig *http.MaxBytesError
		if stderrors.As(err, &tooBig) {
			respondError(c, requestErr(http.StatusRequestEntityTooLarge, "request body is too large"))
			return
		}
		respondError(c, requestErr(http.StatusBadRequest, "could not read the request body"))
		return
	}
	if len(bytes.TrimSpace(body)) > 0 {
		respondError(c, requestErr(http.StatusBadRequest, "the request body must be empty when cloneFromId is set"))
		return
	}

	if _, err := s.db.GetItem(userID, sourceID); err != nil {
		respondError(c, err)
		return
	}
	snapshot, err := s.db.ListItems(userID, model.ItemFilter{})
	if err != nil {
		respondError(c, err)
		return
	}
	plan, err := PlanDuplicate(userID, snapshot, sourceID, uuid.New)
	if err != nil {
		respondError(c, err)
		return
	}
	copied, err := s.db.ApplyDuplicate(plan)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, copied)
}

// ListItems godoc
// @Summary      List items
// @Description  Returns the authenticated user's items without note content, folders first and then by name. Use parent_id to list only the children of one folder, or parent_id=null for the top level.
// @Tags         items
// @Produce      json
// @Security     BearerAuth
// @Param        parent_id  query     string  false  "Folder id, or the word null for the top level"
// @Success      200        {array}   model.Item
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      404        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /items [get]
func (s *ItemsService) ListItems(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	var filter model.ItemFilter
	if raw, ok := c.GetQuery("parent_id"); ok {
		filter.ParentSet = true
		if raw != "null" {
			id, err := uuid.Parse(raw)
			if err != nil {
				respondError(c, requestErr(http.StatusBadRequest, "parent_id must be a valid item id or null"))
				return
			}
			if rerr := s.checkParent(userID, &id); rerr != nil {
				respondError(c, rerr)
				return
			}
			filter.ParentID = &id
		}
	}

	items, err := s.db.ListItems(userID, filter)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// GetItem godoc
// @Summary      Get an item
// @Description  Returns one item, without note content
// @Tags         items
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Item ID"
// @Success      200  {object}  model.Item
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /items/{id} [get]
func (s *ItemsService) GetItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}
	item, err := s.db.GetItem(userID, id)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

// UpdateItem godoc
// @Summary      Update an item
// @Description  Edits the name, icon and/or favorite flag of one item. Partial update: omitted fields are left unchanged, and unknown fields are rejected. An empty icon resets it to the default for the item's type. Use PATCH /items to move items.
// @Tags         items
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id       path      string             true  "Item ID"
// @Param        request  body      UpdateItemRequest  true  "Fields to update"
// @Success      200      {object}  model.Item
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      413      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /items/{id} [patch]
func (s *ItemsService) UpdateItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}

	var req UpdateItemRequest
	if err := decodeBody(c, &req); err != nil {
		respondError(c, err)
		return
	}
	if req.Name == nil && req.Icon == nil && req.IsFavorite == nil {
		respondError(c, requestErr(http.StatusBadRequest, "nothing to update: provide name, icon or is_favorite"))
		return
	}

	item, err := s.db.GetItem(userID, id)
	if err != nil {
		respondError(c, err)
		return
	}

	patch := model.ItemPatch{IsFavorite: req.IsFavorite}
	if req.Name != nil {
		name, rerr := validateName(*req.Name)
		if rerr != nil {
			respondError(c, rerr)
			return
		}
		patch.Name = &name
	}
	if req.Icon != nil {
		if rerr := validateIcon(*req.Icon); rerr != nil {
			respondError(c, rerr)
			return
		}
		icon := *req.Icon
		if icon == "" {
			icon = defaultIcon(item.Type)
		}
		patch.Icon = &icon
	}

	updated, err := s.db.UpdateItem(userID, id, patch)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

// MoveItems godoc
// @Summary      Move items
// @Description  Moves items into a destination folder (or the top level when parent_id is null). Every entry needs a parent_id. Moving a folder moves everything inside it; nothing is copied. The whole request is applied atomically. Returns the items in request order.
// @Tags         items
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      MoveItemsRequest  true  "Items to move and their new parents"
// @Success      200      {array}   model.Item
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      409      {object}  map[string]string
// @Failure      413      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /items [patch]
func (s *ItemsService) MoveItems(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	var req MoveItemsRequest
	if err := decodeBody(c, &req); err != nil {
		respondError(c, err)
		return
	}

	snapshot, err := s.db.ListItems(userID, model.ItemFilter{})
	if err != nil {
		respondError(c, err)
		return
	}
	moves, err := PlanMove(snapshot, req.Items)
	if err != nil {
		respondError(c, err)
		return
	}

	current := make(map[uuid.UUID]model.Item, len(snapshot))
	for _, it := range snapshot {
		current[it.ID] = it
	}
	if len(moves) > 0 {
		moved, err := s.db.MoveItems(userID, moves)
		if err != nil {
			respondError(c, err)
			return
		}
		for _, it := range moved {
			current[it.ID] = it
		}
	}

	result := make([]model.Item, 0, len(req.Items))
	for _, e := range req.Items {
		result = append(result, current[e.ID])
	}
	c.JSON(http.StatusOK, result)
}

// DeleteItem godoc
// @Summary      Delete an item
// @Description  Deletes one item. Deleting a folder deletes everything inside it.
// @Tags         items
// @Security     BearerAuth
// @Param        id   path      string  true  "Item ID"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /items/{id} [delete]
func (s *ItemsService) DeleteItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}
	if err := s.db.DeleteItem(userID, id); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// GetNoteContent godoc
// @Summary      Get a note's content
// @Description  Returns the body of a note. Folders have no content.
// @Tags         items
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Item ID"
// @Success      200  {object}  model.NoteContent
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /items/{id}/content [get]
func (s *ItemsService) GetNoteContent(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}
	content, err := s.db.GetNoteContent(userID, id)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, content)
}

// PutNoteContent godoc
// @Summary      Replace a note's content
// @Description  Replaces the body of a note and bumps the note's updated_at. Folders have no content.
// @Tags         items
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id       path      string             true  "Item ID"
// @Param        request  body      PutContentRequest  true  "New content"
// @Success      200      {object}  model.NoteContent
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      413      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /items/{id}/content [put]
func (s *ItemsService) PutNoteContent(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}

	var req PutContentRequest
	if err := decodeBody(c, &req); err != nil {
		respondError(c, err)
		return
	}
	if req.Content == nil {
		respondError(c, requestErr(http.StatusBadRequest, "content is required"))
		return
	}
	if len(*req.Content) > MaxContentBytes {
		respondError(c, requestErr(http.StatusRequestEntityTooLarge, "content must be at most %d bytes", MaxContentBytes))
		return
	}
	content, err := s.db.PutNoteContent(userID, id, *req.Content)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, content)
}
