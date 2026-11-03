package services_test

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

func opsBody(ops ...string) string { return `{"ops":[` + strings.Join(ops, ",") + `]}` }

func TestApplyOpsSavesABatch(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	r := newItemsRouter(db, &tr.userID)
	page, first, second := uuid.New(), uuid.New(), uuid.New()

	w := doJSON(t, r, http.MethodPost, "/api/v1/ops", opsBody(
		fmt.Sprintf(`{"op":"create","id":"%s","type":"page","parent_id":"%s","props":{"name":"  New page  "}}`, page, tr.root),
		fmt.Sprintf(`{"op":"create","id":"%s","type":"heading","parent_id":"%s","props":{"level":1,"content":[{"type":"text","text":"Hi","styles":{}}]}}`, second, page),
		fmt.Sprintf(`{"op":"create","id":"%s","type":"paragraph","parent_id":"%s","position":0}`, first, page),
	))
	wantStatus(t, w, http.StatusNoContent)

	p := db.Items[page]
	if p.Name() != "New page" || p.Props["icon"] != model.DefaultPageIcon {
		t.Errorf("page = %+v, want a trimmed name and the default icon", p)
	}
	if len(p.ChildIDs) != 2 || p.ChildIDs[0] != first || p.ChildIDs[1] != second {
		t.Errorf("page child_ids = %v, want the paragraph inserted at position 0", p.ChildIDs)
	}
	if got := db.Items[second]; got.Type != model.ItemTypeHeading || got.Props["level"] != 1 {
		t.Errorf("heading = %+v", got)
	}
}

func TestApplyOpsRejectsBadShapes(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	page := tr.page(tr.root, "Page")
	r := newItemsRouter(db, &tr.userID)
	id := uuid.New()
	big := `"` + strings.Repeat("a", 64<<10) + `"`

	cases := map[string]struct {
		body   string
		status int
	}{
		"not json":             {`nope`, http.StatusBadRequest},
		"unknown field":        {opsBody(fmt.Sprintf(`{"op":"delete","id":"%s","after_id":"%s"}`, id, id)), http.StatusBadRequest},
		"empty batch":          {opsBody(), http.StatusBadRequest},
		"unknown op":           {opsBody(fmt.Sprintf(`{"op":"rename","id":"%s"}`, id)), http.StatusBadRequest},
		"missing id":           {opsBody(`{"op":"delete"}`), http.StatusBadRequest},
		"unknown type":         {opsBody(fmt.Sprintf(`{"op":"create","id":"%s","type":"codeBlock","parent_id":"%s"}`, id, page)), http.StatusBadRequest},
		"workspace type":       {opsBody(fmt.Sprintf(`{"op":"create","id":"%s","type":"workspace","parent_id":"%s"}`, id, page)), http.StatusBadRequest},
		"create no parent":     {opsBody(fmt.Sprintf(`{"op":"create","id":"%s","type":"quote"}`, id)), http.StatusBadRequest},
		"negative position":    {opsBody(fmt.Sprintf(`{"op":"move","id":"%s","parent_id":"%s","position":-1}`, id, page)), http.StatusBadRequest},
		"position not an int":  {opsBody(fmt.Sprintf(`{"op":"move","id":"%s","parent_id":"%s","position":1.5}`, id, page)), http.StatusBadRequest},
		"props not an object":  {opsBody(fmt.Sprintf(`{"op":"update","id":"%s","props":[]}`, id)), http.StatusBadRequest},
		"update with parent":   {opsBody(fmt.Sprintf(`{"op":"update","id":"%s","parent_id":"%s","props":{}}`, id, page)), http.StatusBadRequest},
		"update with position": {opsBody(fmt.Sprintf(`{"op":"update","id":"%s","position":0,"props":{}}`, id)), http.StatusBadRequest},
		"empty update":         {opsBody(fmt.Sprintf(`{"op":"update","id":"%s"}`, id)), http.StatusBadRequest},
		"move no parent":       {opsBody(fmt.Sprintf(`{"op":"move","id":"%s","position":0}`, id)), http.StatusBadRequest},
		"move with props":      {opsBody(fmt.Sprintf(`{"op":"move","id":"%s","parent_id":"%s","props":{}}`, id, page)), http.StatusBadRequest},
		"delete with fields":   {opsBody(fmt.Sprintf(`{"op":"delete","id":"%s","props":{}}`, id)), http.StatusBadRequest},
		"trash with position":  {opsBody(fmt.Sprintf(`{"op":"trash","id":"%s","position":0}`, id)), http.StatusBadRequest},
		"props too large":      {opsBody(fmt.Sprintf(`{"op":"update","id":"%s","props":{"content":[%s]}}`, id, big)), http.StatusRequestEntityTooLarge},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/ops", tc.body), tc.status)
		})
	}

	tooMany := make([]string, 501)
	for i := range tooMany {
		tooMany[i] = fmt.Sprintf(`{"op":"delete","id":"%s"}`, uuid.New())
	}
	wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/ops", opsBody(tooMany...)), http.StatusRequestEntityTooLarge)
}

func TestApplyOpsReportsTreeRejections(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	page := tr.page(tr.root, "Page")
	block := tr.block(page, model.ItemTypeParagraph, "x")
	r := newItemsRouter(db, &tr.userID)
	good := fmt.Sprintf(`{"op":"update","id":"%s","props":{"content":[]}}`, block)

	cases := map[string]struct {
		op     string
		status int
	}{
		"not found":         {fmt.Sprintf(`{"op":"delete","id":"%s"}`, uuid.New()), http.StatusNotFound},
		"position too far":  {fmt.Sprintf(`{"op":"create","id":"%s","type":"quote","parent_id":"%s","position":5}`, uuid.New(), page), http.StatusConflict},
		"delete a page":     {fmt.Sprintf(`{"op":"delete","id":"%s"}`, page), http.StatusBadRequest},
		"heading, no level": {fmt.Sprintf(`{"op":"update","id":"%s","type":"heading"}`, block), http.StatusBadRequest},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			w := doJSON(t, r, http.MethodPost, "/api/v1/ops", opsBody(good, tc.op))
			wantStatus(t, w, tc.status)
			if body := decode[map[string]any](t, w); body["op_index"] != float64(1) {
				t.Errorf("body = %v, want op_index 1", body)
			}
			if content, _ := db.Items[block].Props["content"].([]any); len(content) == 0 {
				t.Error("the good op before the rejected one was kept")
			}
		})
	}
}

func TestApplyOpsAuthAndErrors(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	body := opsBody(fmt.Sprintf(`{"op":"delete","id":"%s"}`, uuid.New()))
	wantStatus(t, doJSON(t, newItemsRouter(db, nil), http.MethodPost, "/api/v1/ops", body), http.StatusUnauthorized)

	db.Errs["ApplyOps"] = errors.New("boom")
	wantStatus(t, doJSON(t, newItemsRouter(db, &tr.userID), http.MethodPost, "/api/v1/ops", body), http.StatusInternalServerError)
}

func TestDuplicateItemEndpoint(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	page := tr.page(tr.root, "Page")
	tr.block(page, model.ItemTypeParagraph, "x")
	r := newItemsRouter(db, &tr.userID)

	w := doJSON(t, r, http.MethodPost, itemPath(page)+"/duplicate", nil)
	wantStatus(t, w, http.StatusCreated)
	copied := decode[model.Item](t, w)
	if copied.Name() != "Page (Copy 1)" || len(copied.ChildIDs) != 1 {
		t.Errorf("copy = %+v", copied)
	}

	wantStatus(t, doJSON(t, r, http.MethodPost, itemPath(uuid.New())+"/duplicate", nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodPost, itemPath(tr.root)+"/duplicate", nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/items/nope/duplicate", nil), http.StatusBadRequest)
}
