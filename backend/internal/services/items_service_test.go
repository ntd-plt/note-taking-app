package services_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func newItemsRouter(db *testutil.FakeDatabase, userID *uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := services.NewItemsService(db)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if userID != nil {
			c.Set("userID", *userID)
		}
	})
	r.GET("/api/v1/items/:id", h.GetItem)
	r.GET("/api/v1/pages", h.ListPages)
	return r
}

// tree adds items for one user to a fake database, each appended to its parent.
type tree struct {
	t      *testing.T
	db     *testutil.FakeDatabase
	userID uuid.UUID
	root   uuid.UUID
}

func newTree(t *testing.T, db *testutil.FakeDatabase) *tree {
	userID := uuid.New()
	return &tree{t: t, db: db, userID: userID, root: db.Workspace(userID).ID}
}

func (tr *tree) add(it model.Item) uuid.UUID {
	tr.t.Helper()
	it.ID = uuid.New()
	if err := tr.db.InsertItems(tr.userID, []model.Item{it}); err != nil {
		tr.t.Fatal(err)
	}
	return it.ID
}

func (tr *tree) page(parent uuid.UUID, name string) uuid.UUID {
	icon := "📄"
	return tr.add(model.Item{ParentID: &parent, Type: model.ItemTypePage, Name: &name, Icon: &icon})
}

func (tr *tree) block(parent uuid.UUID, typ model.ItemType, text string) uuid.UUID {
	content, _ := json.Marshal([]map[string]any{{"type": "text", "text": text, "styles": map[string]any{}}})
	return tr.add(model.Item{ParentID: &parent, Type: typ, Content: content})
}

func (tr *tree) trash(id uuid.UUID) {
	it := tr.db.Items[id]
	now := time.Now()
	it.TrashedAt = &now
	tr.db.Items[id] = it
	ws := tr.db.Items[tr.root]
	ws.ChildIDs = slices.DeleteFunc(slices.Clone(ws.ChildIDs), func(c uuid.UUID) bool { return c == id })
	tr.db.Items[tr.root] = ws
}

func wantStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, want, w.Body.String())
	}
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("decoding %q: %v", w.Body.String(), err)
	}
	return v
}

func itemPath(id uuid.UUID) string { return "/api/v1/items/" + id.String() }

func blockIDs(items []model.Item) []uuid.UUID {
	out := make([]uuid.UUID, len(items))
	for i, it := range items {
		out[i] = it.ID
	}
	return out
}

func stubNames(stubs []model.PageStub) []string {
	out := make([]string, len(stubs))
	for i, s := range stubs {
		out[i] = s.Name
	}
	return out
}

func TestGetItemReturnsPageBlocksInOrderAndStopsAtChildPages(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	page := tr.page(tr.root, "Page")
	h := tr.block(page, model.ItemTypeHeading, "Title")
	bullet := tr.block(page, model.ItemTypeBulletListItem, "Bullet")
	nested := tr.block(bullet, model.ItemTypeBulletListItem, "Nested")
	child := tr.page(bullet, "Child")
	tr.block(child, model.ItemTypeParagraph, "Inside the child page")
	last := tr.block(page, model.ItemTypeParagraph, "")

	w := doJSON(t, newItemsRouter(db, &tr.userID), http.MethodGet, itemPath(page), nil)
	wantStatus(t, w, http.StatusOK)
	resp := decode[services.ItemResponse](t, w)

	if resp.Page.ID != page || *resp.Page.Name != "Page" {
		t.Errorf("page = %+v", resp.Page)
	}
	if !slices.Equal(resp.Page.ChildIDs, []uuid.UUID{h, bullet, last}) {
		t.Errorf("page child_ids = %v", resp.Page.ChildIDs)
	}
	if got, want := blockIDs(resp.Blocks), []uuid.UUID{h, bullet, nested, last}; !slices.Equal(got, want) {
		t.Errorf("blocks = %v, want %v (document order, no child page content)", got, want)
	}
	if len(resp.ChildPages) != 1 || resp.ChildPages[0].ID != child || resp.ChildPages[0].Name != "Child" {
		t.Errorf("child pages = %+v", resp.ChildPages)
	}
	if resp.Blocks[1].ChildIDs == nil || !slices.Equal(resp.Blocks[1].ChildIDs, []uuid.UUID{nested, child}) {
		t.Errorf("bullet child_ids = %v, want the nested bullet then the child page", resp.Blocks[1].ChildIDs)
	}
	if resp.FocusID != nil || resp.InTrash || len(resp.Ancestors) != 0 {
		t.Errorf("focus = %v, in_trash = %v, ancestors = %v", resp.FocusID, resp.InTrash, resp.Ancestors)
	}
}

func TestGetItemForBlockOpensItsPageWithFocus(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	top := tr.page(tr.root, "Top")
	list := tr.block(top, model.ItemTypeToggleListItem, "Toggle")
	mid := tr.page(list, "Middle")
	page := tr.page(mid, "Leaf")
	block := tr.block(page, model.ItemTypeQuote, "Quote")
	deep := tr.block(block, model.ItemTypeParagraph, "Deep")

	w := doJSON(t, newItemsRouter(db, &tr.userID), http.MethodGet, itemPath(deep), nil)
	wantStatus(t, w, http.StatusOK)
	resp := decode[services.ItemResponse](t, w)

	if resp.Page.ID != page {
		t.Errorf("page = %v, want the block's page %v", resp.Page.ID, page)
	}
	if resp.FocusID == nil || *resp.FocusID != deep {
		t.Errorf("focus = %v, want %v", resp.FocusID, deep)
	}
	if got := stubNames(resp.Ancestors); !slices.Equal(got, []string{"Top", "Middle"}) {
		t.Errorf("ancestors = %v, want top-level first", got)
	}
}

func TestGetItemInsideTrashedPage(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	trashed := tr.page(tr.root, "Trashed")
	child := tr.page(trashed, "Child")
	tr.trash(trashed)

	w := doJSON(t, newItemsRouter(db, &tr.userID), http.MethodGet, itemPath(child), nil)
	wantStatus(t, w, http.StatusOK)
	if resp := decode[services.ItemResponse](t, w); !resp.InTrash {
		t.Error("in_trash = false for a page inside a trashed page")
	}
}

func TestGetItemNotFound(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	page := tr.page(tr.root, "Mine")
	other := newTree(t, db)
	r := newItemsRouter(db, &other.userID)

	cases := map[string]string{
		"another user's page": itemPath(page),
		"unknown id":          itemPath(uuid.New()),
		"own workspace":       itemPath(other.root),
	}
	for name, path := range cases {
		t.Run(name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, http.MethodGet, path, nil), http.StatusNotFound)
		})
	}
}

func TestGetItemBadRequestAndAuth(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	wantStatus(t, doJSON(t, newItemsRouter(db, &userID), http.MethodGet, "/api/v1/items/nope", nil), http.StatusBadRequest)
	wantStatus(t, doJSON(t, newItemsRouter(db, nil), http.MethodGet, itemPath(uuid.New()), nil), http.StatusUnauthorized)
}

func TestGetItemDatabaseError(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	page := tr.page(tr.root, "Page")
	db.Errs["GetPageTree"] = errors.New("boom")

	w := doJSON(t, newItemsRouter(db, &tr.userID), http.MethodGet, itemPath(page), nil)
	wantStatus(t, w, http.StatusInternalServerError)
}

func TestListPagesInDocumentOrderWithParents(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	a := tr.page(tr.root, "A")
	bullet := tr.block(a, model.ItemTypeBulletListItem, "Bullet")
	a1 := tr.page(bullet, "A1")
	a2 := tr.page(a, "A2")
	gone := tr.page(tr.root, "Gone")
	tr.page(gone, "Inside gone")
	tr.trash(gone)
	b := tr.page(tr.root, "B")
	other := newTree(t, db)
	other.page(other.root, "Someone else's")

	w := doJSON(t, newItemsRouter(db, &tr.userID), http.MethodGet, "/api/v1/pages", nil)
	wantStatus(t, w, http.StatusOK)
	pages := decode[[]model.PageSummary](t, w)

	var ids []uuid.UUID
	for _, p := range pages {
		ids = append(ids, p.ID)
	}
	if !slices.Equal(ids, []uuid.UUID{a, a1, a2, b}) {
		t.Fatalf("pages = %+v", pages)
	}
	if pages[0].ParentID != tr.root || pages[0].ParentPageID != nil {
		t.Errorf("A: parent = %v, parent page = %v", pages[0].ParentID, pages[0].ParentPageID)
	}
	if pages[1].ParentID != bullet || pages[1].ParentPageID == nil || *pages[1].ParentPageID != a {
		t.Errorf("A1: parent = %v, parent page = %v; want the bullet and A", pages[1].ParentID, pages[1].ParentPageID)
	}
	if pages[2].ParentID != a || *pages[2].ParentPageID != a {
		t.Errorf("A2: parent = %v, parent page = %v", pages[2].ParentID, pages[2].ParentPageID)
	}
}

func TestListPagesEmptyAndErrors(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	r := newItemsRouter(db, &tr.userID)

	w := doJSON(t, r, http.MethodGet, "/api/v1/pages", nil)
	wantStatus(t, w, http.StatusOK)
	if w.Body.String() != "[]" {
		t.Errorf("body = %s, want []", w.Body.String())
	}

	db.Errs["ListPages"] = errors.New("boom")
	wantStatus(t, doJSON(t, r, http.MethodGet, "/api/v1/pages", nil), http.StatusInternalServerError)
	wantStatus(t, doJSON(t, newItemsRouter(db, nil), http.MethodGet, "/api/v1/pages", nil), http.StatusUnauthorized)
}
