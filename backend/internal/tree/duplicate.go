package tree

import (
	"maps"
	"regexp"
	"slices"
	"strconv"
	"time"
	"unicode/utf8"

	"backend/internal/model"

	"github.com/google/uuid"
)

var copySuffixPattern = regexp.MustCompile(`^(.*) \(Copy \d+\)$`)

// CloneName returns the smallest "base (Copy N)" not in occupied, with the base
// shortened so the whole name fits.
func CloneName(name string, occupied map[string]bool) string {
	base := name
	if m := copySuffixPattern.FindStringSubmatch(name); m != nil && m[1] != "" {
		base = m[1]
	}
	for n := 1; ; n++ {
		suffix := " (Copy " + strconv.Itoa(n) + ")"
		room := model.MaxNameLength - utf8.RuneCountInString(suffix)
		trimmed := base
		if utf8.RuneCountInString(trimmed) > room {
			trimmed = string([]rune(trimmed)[:room])
		}
		if candidate := trimmed + suffix; !occupied[candidate] {
			return candidate
		}
	}
}

// Duplicate deep-copies an item and everything under it, child pages included,
// with new ids, and places the copy right after the original. When the copy's root
// is a page it is renamed "Name (Copy N)". Copied pages are never favorites.
func Duplicate(s Store, workspaceID, id uuid.UUID, now time.Time) (model.Item, error) {
	e, err := newEngine(s, workspaceID, now)
	if err != nil {
		return model.Item{}, err
	}
	src, err := e.get(id, "item")
	if err != nil {
		return model.Item{}, err
	}
	if _, err := e.chain(src); err != nil {
		return model.Item{}, err
	}
	below, err := s.Descendants(src.ID)
	if err != nil {
		return model.Item{}, err
	}
	if len(below)+1 > MaxDuplicateRows {
		return model.Item{}, e.fail(Invalid, "cannot duplicate more than %d items at once", MaxDuplicateRows)
	}

	newIDs := map[uuid.UUID]uuid.UUID{src.ID: uuid.New()}
	byID := map[uuid.UUID]model.Item{src.ID: src}
	for _, d := range below {
		newIDs[d.ID] = uuid.New()
		byID[d.ID] = d
	}
	clone := func(it model.Item, parent uuid.UUID) model.Item {
		c := it
		c.ID, c.ParentID, c.TrashedAt = newIDs[it.ID], &parent, nil
		c.ChildIDs = make([]uuid.UUID, 0, len(it.ChildIDs))
		for _, child := range it.ChildIDs {
			if n, ok := newIDs[child]; ok {
				c.ChildIDs = append(c.ChildIDs, n)
			}
		}
		c.Props = maps.Clone(it.Props)
		if c.Type == model.ItemTypePage {
			c.Props[model.PropIsFavorite] = false
		}
		c.CreatedAt, c.UpdatedAt = now, now
		return c
	}

	root := clone(src, *src.ParentID)
	if root.Type == model.ItemTypePage {
		parent, err := e.getAny(*src.ParentID, "parent")
		if err != nil {
			return model.Item{}, err
		}
		occupied := map[string]bool{}
		for _, sib := range parent.ChildIDs {
			if it, err := e.getAny(sib, "sibling"); err == nil && it.Type == model.ItemTypePage {
				occupied[it.Name()] = true
			}
		}
		root.Props[model.PropName] = CloneName(src.Name(), occupied)
	}

	// Insert parents before children, following child_ids from the root down.
	copies := []model.Item{root}
	for queue := []model.Item{src}; len(queue) > 0; queue = queue[1:] {
		for _, child := range queue[0].ChildIDs {
			it, ok := byID[child]
			if !ok {
				continue
			}
			copies = append(copies, clone(it, newIDs[queue[0].ID]))
			queue = append(queue, it)
		}
	}
	for _, c := range copies {
		if err := s.Insert(c); err != nil {
			return model.Item{}, err
		}
		e.cache[c.ID] = c
		if len(c.ChildIDs) > 0 {
			e.touched[c.ID] = true
		}
	}

	parent, err := e.getAny(*src.ParentID, "parent")
	if err != nil {
		return model.Item{}, err
	}
	at := slices.Index(parent.ChildIDs, src.ID) + 1
	if err := e.attach(parent.ID, root.ID, &at); err != nil {
		return model.Item{}, err
	}
	return root, e.finish()
}
