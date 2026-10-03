package services_test

import (
	"errors"
	"strings"
	"testing"

	"backend/internal/model"
	"backend/internal/services"

	"github.com/google/uuid"
)

// treeBuilder assembles a HierarchySnapshot for planner tests.
type treeBuilder struct {
	snap model.HierarchySnapshot
}

func newTree() *treeBuilder {
	return &treeBuilder{snap: model.HierarchySnapshot{Foreign: map[uuid.UUID]bool{}}}
}

func (b *treeBuilder) folder(name string, parent *uuid.UUID) uuid.UUID {
	id := uuid.New()
	b.snap.Folders = append(b.snap.Folders, model.HierarchyFolderNode{ID: id, ParentID: parent, Name: name})
	return id
}

func (b *treeBuilder) note(title string, folder *uuid.UUID) uuid.UUID {
	id := uuid.New()
	b.snap.Notes = append(b.snap.Notes, model.HierarchyNoteNode{ID: id, FolderID: folder, Title: title})
	return id
}

func ref(id uuid.UUID, typ string) services.MoveItemRef {
	return services.MoveItemRef{ID: id, Type: typ}
}

func plan(t *testing.T, b *treeBuilder, items []services.MoveItemRef, dest *uuid.UUID) model.MovePlan {
	t.Helper()
	p, err := services.PlanMove(uuid.New(), b.snap, items, dest, uuid.New)
	if err != nil {
		t.Fatalf("PlanMove: unexpected error: %v", err)
	}
	return p
}

func moveErrKind(t *testing.T, err error) services.MoveErrorKind {
	t.Helper()
	var me *services.MoveError
	if !errors.As(err, &me) {
		t.Fatalf("error = %v, want *MoveError", err)
	}
	return me.Kind
}

func ptr(id uuid.UUID) *uuid.UUID { return &id }

func TestPlanMoveMovesTopLevelItemsKeepingIDs(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	f := b.folder("Docs", nil)
	n := b.note("Todo", nil)

	p := plan(t, b, []services.MoveItemRef{ref(f, "folder"), ref(n, "note")}, &dest)

	if len(p.MovedFolders) != 1 || p.MovedFolders[0] != f {
		t.Errorf("MovedFolders = %v, want [%v]", p.MovedFolders, f)
	}
	if len(p.MovedNotes) != 1 || p.MovedNotes[0] != n {
		t.Errorf("MovedNotes = %v, want [%v]", p.MovedNotes, n)
	}
	if len(p.FolderClones)+len(p.NoteClones) != 0 {
		t.Errorf("expected no clones, got %d folders and %d notes", len(p.FolderClones), len(p.NoteClones))
	}
	if p.Destination == nil || *p.Destination != dest {
		t.Errorf("Destination = %v, want %v", p.Destination, dest)
	}
}

func TestPlanMoveToRoot(t *testing.T) {
	b := newTree()
	parent := b.folder("Parent", nil)
	n := b.note("Deep", &parent)

	p := plan(t, b, []services.MoveItemRef{ref(n, "note")}, nil)

	if p.Destination != nil {
		t.Errorf("Destination = %v, want nil (root)", p.Destination)
	}
	if len(p.MovedNotes) != 1 {
		t.Errorf("MovedNotes = %v, want one note", p.MovedNotes)
	}
}

func TestPlanMoveClonesNoteInsideSelectedFolder(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	a := b.folder("A", nil)
	n := b.note("B", &a)

	p := plan(t, b, []services.MoveItemRef{ref(a, "folder"), ref(n, "note")}, &dest)

	if len(p.MovedFolders) != 1 || p.MovedFolders[0] != a {
		t.Errorf("MovedFolders = %v, want [A]", p.MovedFolders)
	}
	if len(p.MovedNotes) != 0 {
		t.Errorf("the nested note must not be moved, got %v", p.MovedNotes)
	}
	if len(p.NoteClones) != 1 {
		t.Fatalf("NoteClones = %d, want 1", len(p.NoteClones))
	}
	c := p.NoteClones[0]
	if c.SourceID != n || c.NewID == n {
		t.Errorf("clone = %+v, want a new id cloned from %v", c, n)
	}
	if c.FolderID == nil || *c.FolderID != dest {
		t.Errorf("clone folder = %v, want destination %v (beside the moved parent)", c.FolderID, dest)
	}
	if c.Title != "B (Copy 1)" {
		t.Errorf("clone title = %q, want %q", c.Title, "B (Copy 1)")
	}
}

func TestPlanMoveNewEntriesInDestinationMatchSelectionCount(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	a := b.folder("A", nil)
	sub := b.folder("Sub", &a)
	n1 := b.note("N1", &a)
	n2 := b.note("N2", &sub)
	loose := b.note("Loose", nil)

	items := []services.MoveItemRef{
		ref(a, "folder"), ref(sub, "folder"), ref(n1, "note"), ref(n2, "note"), ref(loose, "note"),
	}
	p := plan(t, b, items, &dest)

	direct := len(p.MovedFolders) + len(p.MovedNotes)
	for _, c := range p.FolderClones {
		if c.ParentID != nil && *c.ParentID == dest {
			direct++
		}
	}
	for _, c := range p.NoteClones {
		if c.FolderID != nil && *c.FolderID == dest {
			direct++
		}
	}
	if direct != len(items) {
		t.Errorf("new direct entries in destination = %d, want %d (one per selected item)", direct, len(items))
	}
}

func TestPlanMoveClonesFoldersRecursivelyParentsFirst(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	a := b.folder("A", nil)
	child := b.folder("Child", &a)
	grandchild := b.folder("Grandchild", &child)
	b.note("Inner", &grandchild)
	b.note("Side", &child)

	p := plan(t, b, []services.MoveItemRef{ref(a, "folder"), ref(child, "folder")}, &dest)

	if len(p.MovedFolders) != 1 || p.MovedFolders[0] != a {
		t.Fatalf("MovedFolders = %v, want [A]", p.MovedFolders)
	}
	if len(p.FolderClones) != 2 {
		t.Fatalf("FolderClones = %d, want 2 (Child and Grandchild)", len(p.FolderClones))
	}
	if len(p.NoteClones) != 2 {
		t.Fatalf("NoteClones = %d, want 2 (Inner and Side)", len(p.NoteClones))
	}

	root := p.FolderClones[0]
	if root.SourceID != child || root.Name != "Child (Copy 1)" {
		t.Errorf("root clone = %+v, want Child cloned as %q", root, "Child (Copy 1)")
	}
	if root.ParentID == nil || *root.ParentID != dest {
		t.Errorf("root clone parent = %v, want destination", root.ParentID)
	}
	nested := p.FolderClones[1]
	if nested.Name != "Grandchild" {
		t.Errorf("nested clone name = %q, want unchanged %q", nested.Name, "Grandchild")
	}
	if nested.ParentID == nil || *nested.ParentID != root.NewID {
		t.Errorf("nested clone parent = %v, want the cloned Child %v", nested.ParentID, root.NewID)
	}
	for _, nc := range p.NoteClones {
		if nc.Title != "Inner" && nc.Title != "Side" {
			t.Errorf("cloned note title = %q, contents of a cloned folder keep their names", nc.Title)
		}
	}
}

func TestPlanMoveRejectsDestinationInsideSelection(t *testing.T) {
	b := newTree()
	a := b.folder("A", nil)
	child := b.folder("Child", &a)
	grandchild := b.folder("Grandchild", &child)

	cases := map[string]uuid.UUID{
		"itself":     a,
		"child":      child,
		"grandchild": grandchild,
	}
	for name, dest := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := services.PlanMove(uuid.New(), b.snap, []services.MoveItemRef{ref(a, "folder")}, ptr(dest), uuid.New)
			if err == nil {
				t.Fatal("expected an error")
			}
			if k := moveErrKind(t, err); k != services.MoveInvalid {
				t.Errorf("kind = %v, want MoveInvalid", k)
			}
		})
	}
}

func TestPlanMoveRejectsDestinationUnderClonedItem(t *testing.T) {
	b := newTree()
	a := b.folder("A", nil)
	child := b.folder("Child", &a)
	grandchild := b.folder("Grandchild", &child)

	// Child is cloned (it sits inside selected A); dropping onto Grandchild is still invalid.
	_, err := services.PlanMove(uuid.New(), b.snap,
		[]services.MoveItemRef{ref(a, "folder"), ref(child, "folder")}, &grandchild, uuid.New)
	if err == nil || moveErrKind(t, err) != services.MoveInvalid {
		t.Fatalf("err = %v, want MoveInvalid", err)
	}
}

func TestPlanMoveNotFoundAndForbidden(t *testing.T) {
	b := newTree()
	mine := b.folder("Mine", nil)
	foreign := uuid.New()
	b.snap.Foreign[foreign] = true
	unknown := uuid.New()

	cases := []struct {
		name  string
		items []services.MoveItemRef
		dest  *uuid.UUID
		want  services.MoveErrorKind
	}{
		{"unknown item", []services.MoveItemRef{ref(unknown, "note")}, nil, services.MoveNotFound},
		{"foreign item", []services.MoveItemRef{ref(foreign, "folder")}, nil, services.MoveForbidden},
		{"unknown destination", []services.MoveItemRef{ref(mine, "folder")}, &unknown, services.MoveNotFound},
		{"foreign destination", []services.MoveItemRef{ref(mine, "folder")}, &foreign, services.MoveForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := services.PlanMove(uuid.New(), b.snap, tc.items, tc.dest, uuid.New)
			if err == nil {
				t.Fatal("expected an error")
			}
			if k := moveErrKind(t, err); k != tc.want {
				t.Errorf("kind = %v, want %v", k, tc.want)
			}
		})
	}
}

func TestPlanMoveCloneNumbering(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	b.note("Report (Copy 1)", &dest)
	b.note("Report (Copy 3)", &dest)
	a := b.folder("A", nil)
	r1 := b.note("Report", &a)
	r2 := b.note("Report (Copy 1)", &a)
	r3 := b.note("Report", &a)

	p := plan(t, b, []services.MoveItemRef{
		ref(a, "folder"), ref(r1, "note"), ref(r2, "note"), ref(r3, "note"),
	}, &dest)

	var got []string
	for _, c := range p.NoteClones {
		got = append(got, c.Title)
	}
	// (Copy 1) and (Copy 3) are taken, so numbering takes the smallest free slots: 2, 4, 5.
	want := []string{"Report (Copy 2)", "Report (Copy 4)", "Report (Copy 5)"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("clone titles = %v, want %v", got, want)
	}
}

func TestPlanMoveCloneNumberingSeparatesFoldersAndNotes(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	b.folder("Shared", &dest)
	a := b.folder("A", nil)
	n := b.note("Shared", &a)

	p := plan(t, b, []services.MoveItemRef{ref(a, "folder"), ref(n, "note")}, &dest)

	if len(p.NoteClones) != 1 || p.NoteClones[0].Title != "Shared (Copy 1)" {
		t.Errorf("NoteClones = %+v, want one note named %q", p.NoteClones, "Shared (Copy 1)")
	}
}

func TestPlanMoveCloneNumberingCountsArrivingItems(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	a := b.folder("A", nil)
	inside := b.note("Plan", &a)
	arriving := b.note("Plan (Copy 1)", nil)

	p := plan(t, b, []services.MoveItemRef{ref(a, "folder"), ref(inside, "note"), ref(arriving, "note")}, &dest)

	if len(p.NoteClones) != 1 || p.NoteClones[0].Title != "Plan (Copy 2)" {
		t.Errorf("NoteClones = %+v, want %q because a moved note already arrives as %q",
			p.NoteClones, "Plan (Copy 2)", "Plan (Copy 1)")
	}
}

func TestPlanMoveCloneStripsExistingSuffix(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	a := b.folder("A", nil)
	n := b.note("Report (Copy 1)", &a)

	p := plan(t, b, []services.MoveItemRef{ref(a, "folder"), ref(n, "note")}, &dest)

	if got := p.NoteClones[0].Title; got != "Report (Copy 1)" {
		t.Errorf("title = %q, want the suffix replaced not stacked (%q)", got, "Report (Copy 1)")
	}
}

func TestPlanMoveCloneTruncatesLongNames(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	a := b.folder("A", nil)
	long := strings.Repeat("é", 255)
	n := b.note(long, &a)

	p := plan(t, b, []services.MoveItemRef{ref(a, "folder"), ref(n, "note")}, &dest)

	title := p.NoteClones[0].Title
	if got := len([]rune(title)); got != 255 {
		t.Errorf("clone title has %d characters, want exactly 255", got)
	}
	if !strings.HasSuffix(title, " (Copy 1)") {
		t.Errorf("clone title %q must keep its copy suffix", title[len(title)-12:])
	}
}

func TestPlanMoveIgnoresDuplicateSelection(t *testing.T) {
	b := newTree()
	n := b.note("Once", nil)

	p := plan(t, b, []services.MoveItemRef{ref(n, "note"), ref(n, "note")}, nil)

	if len(p.MovedNotes) != 1 {
		t.Errorf("MovedNotes = %v, want the duplicate entry ignored", p.MovedNotes)
	}
}

func TestPlanMoveRejectsTooManyItems(t *testing.T) {
	b := newTree()
	var items []services.MoveItemRef
	for i := 0; i < services.MaxMoveItems+1; i++ {
		items = append(items, ref(b.note("n", nil), "note"))
	}

	_, err := services.PlanMove(uuid.New(), b.snap, items, nil, uuid.New)
	if err == nil || moveErrKind(t, err) != services.MoveInvalid {
		t.Fatalf("err = %v, want MoveInvalid", err)
	}
}

func TestPlanMoveRejectsTooManyCreatedRows(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	a := b.folder("A", nil)
	big := b.folder("Big", &a)
	for i := 0; i < services.MaxMoveCreatedRows; i++ {
		b.note("n", &big)
	}

	_, err := services.PlanMove(uuid.New(), b.snap,
		[]services.MoveItemRef{ref(a, "folder"), ref(big, "folder")}, &dest, uuid.New)
	if err == nil || moveErrKind(t, err) != services.MoveInvalid {
		t.Fatalf("err = %v, want MoveInvalid", err)
	}
}

func TestPlanMoveSurvivesCyclesInStoredData(t *testing.T) {
	b := newTree()
	dest := b.folder("Dest", nil)
	x := uuid.New()
	y := uuid.New()
	b.snap.Folders = append(b.snap.Folders,
		model.HierarchyFolderNode{ID: x, ParentID: &y, Name: "X"},
		model.HierarchyFolderNode{ID: y, ParentID: &x, Name: "Y"},
	)

	// Must terminate rather than loop forever on corrupt parent links.
	_, err := services.PlanMove(uuid.New(), b.snap, []services.MoveItemRef{ref(x, "folder")}, &dest, uuid.New)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPlanDuplicateCopiesInPlaceWithNumbering(t *testing.T) {
	b := newTree()
	root := b.folder("Root", nil)
	a := b.note("Report", &root)
	b.note("Report (Copy 1)", &root)
	elsewhere := b.folder("Other", nil)
	b.note("Report (Copy 2)", &elsewhere) // a different parent: must not count

	p, err := services.PlanDuplicate(uuid.New(), b.snap,
		[]services.MoveItemRef{ref(a, "note"), ref(a, "note")}, uuid.New)
	if err != nil {
		t.Fatal(err)
	}

	if len(p.MovedFolders)+len(p.MovedNotes) != 0 || p.Destination != nil {
		t.Errorf("duplicating must not move anything: %+v", p)
	}
	if len(p.NoteClones) != 1 {
		t.Fatalf("NoteClones = %d, want 1 (the repeated entry is ignored)", len(p.NoteClones))
	}
	c := p.NoteClones[0]
	if c.Title != "Report (Copy 2)" || c.FolderID == nil || *c.FolderID != root {
		t.Errorf("clone = %+v, want %q in the original's folder", c, "Report (Copy 2)")
	}
}

func TestPlanDuplicateNumbersSeveralCopiesOfOneNameApart(t *testing.T) {
	b := newTree()
	x := b.note("Same", nil)
	y := b.note("Same", nil)

	p, err := services.PlanDuplicate(uuid.New(), b.snap,
		[]services.MoveItemRef{ref(x, "note"), ref(y, "note")}, uuid.New)
	if err != nil {
		t.Fatal(err)
	}

	if len(p.NoteClones) != 2 || p.NoteClones[0].Title != "Same (Copy 1)" || p.NoteClones[1].Title != "Same (Copy 2)" {
		t.Errorf("NoteClones = %+v, want Same (Copy 1) and Same (Copy 2)", p.NoteClones)
	}
}

func TestPlanDuplicateRootLevelFolder(t *testing.T) {
	b := newTree()
	f := b.folder("Top", nil)
	b.note("Inside", &f)

	p, err := services.PlanDuplicate(uuid.New(), b.snap, []services.MoveItemRef{ref(f, "folder")}, uuid.New)
	if err != nil {
		t.Fatal(err)
	}

	if len(p.FolderClones) != 1 || p.FolderClones[0].ParentID != nil || p.FolderClones[0].Name != "Top (Copy 1)" {
		t.Errorf("FolderClones = %+v, want a top-level %q", p.FolderClones, "Top (Copy 1)")
	}
	if len(p.NoteClones) != 1 || p.NoteClones[0].Title != "Inside" {
		t.Errorf("NoteClones = %+v, want the folder's note copied unrenamed", p.NoteClones)
	}
}

func TestPlanDuplicateRejectsForeignAndTooMany(t *testing.T) {
	b := newTree()
	foreign := uuid.New()
	b.snap.Foreign[foreign] = true

	if _, err := services.PlanDuplicate(uuid.New(), b.snap, []services.MoveItemRef{ref(foreign, "note")}, uuid.New); err == nil || moveErrKind(t, err) != services.MoveForbidden {
		t.Errorf("foreign: err = %v, want MoveForbidden", err)
	}

	big := b.folder("Big", nil)
	for i := 0; i < services.MaxMoveCreatedRows; i++ {
		b.note("n", &big)
	}
	if _, err := services.PlanDuplicate(uuid.New(), b.snap, []services.MoveItemRef{ref(big, "folder")}, uuid.New); err == nil || moveErrKind(t, err) != services.MoveInvalid {
		t.Errorf("cap: err = %v, want MoveInvalid", err)
	}
}
