package model_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"backend/internal/model"
)

func TestCompletePropsFillsDefaults(t *testing.T) {
	cases := []struct {
		typ  model.ItemType
		in   model.Props
		want model.Props
	}{
		{model.ItemTypePage, nil, model.Props{"name": "New Page", "icon": "📄", "is_favorite": false}},
		{model.ItemTypePage, model.Props{"name": "  Plans  ", "icon": "🗺️", "is_favorite": true, "cover": "x"},
			model.Props{"name": "Plans", "icon": "🗺️", "is_favorite": true, "cover": "x"}},
		{model.ItemTypeParagraph, nil, model.Props{"content": []any{}}},
		{model.ItemTypeCheckListItem, model.Props{"textColor": "red"}, model.Props{"content": []any{}, "checked": false, "textColor": "red"}},
		{model.ItemTypeHeading, model.Props{"level": float64(2)}, model.Props{"content": []any{}, "level": 2}},
		{model.ItemTypeHeading, model.Props{"level": 3}, model.Props{"content": []any{}, "level": 3}},
		{model.ItemTypeWorkspace, nil, model.Props{}},
	}
	for _, tc := range cases {
		got, err := model.CompleteProps(tc.typ, tc.in)
		if err != nil {
			t.Errorf("%s %v: %v", tc.typ, tc.in, err)
			continue
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s %v = %v, want %v", tc.typ, tc.in, got, tc.want)
		}
	}
}

func TestCompletePropsReplacesWrongValues(t *testing.T) {
	got, err := model.CompleteProps(model.ItemTypePage, model.Props{
		"name": "   ", "icon": strings.Repeat("x", model.MaxIconLength+1), "is_favorite": "yes",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := model.Props{"name": "New Page", "icon": "📄", "is_favorite": false}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	long := strings.Repeat("a", model.MaxNameLength+1)
	if got, _ := model.CompleteProps(model.ItemTypePage, model.Props{"name": long}); got["name"] != "New Page" {
		t.Errorf("a name over %d characters was kept", model.MaxNameLength)
	}
	if got, _ := model.CompleteProps(model.ItemTypeQuote, model.Props{"content": "hi"}); !reflect.DeepEqual(got["content"], []any{}) {
		t.Errorf("content = %v, want an empty list", got["content"])
	}
	if got, _ := model.CompleteProps(model.ItemTypeQuote, model.Props{"content": []map[string]any{{"type": "text"}}}); got["content"] == nil {
		t.Error("a list built in Go was not accepted as content")
	}
}

func TestCompletePropsNeedsHeadingLevel(t *testing.T) {
	for _, level := range []any{nil, 0, 4, 1.5, "2"} {
		props := model.Props{}
		if level != nil {
			props["level"] = level
		}
		_, err := model.CompleteProps(model.ItemTypeHeading, props)
		var missing *model.MissingPropError
		if !errors.As(err, &missing) || missing.Key != "level" {
			t.Errorf("level %v: err = %v, want a missing level", level, err)
		}
	}
}

func TestCompletePropsDoesNotChangeItsInput(t *testing.T) {
	in := model.Props{"name": " x "}
	if _, err := model.CompleteProps(model.ItemTypePage, in); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(in, model.Props{"name": " x "}) {
		t.Errorf("input changed to %v", in)
	}
}
