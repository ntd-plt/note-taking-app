package model

import (
	"fmt"
	"maps"
	"reflect"
	"strings"
	"unicode/utf8"
)

// Prop keys the server relies on.
const (
	PropName       = "name"
	PropIcon       = "icon"
	PropIsFavorite = "is_favorite"
	PropContent    = "content"
	PropLevel      = "level"
	PropChecked    = "checked"
)

const (
	MaxNameLength   = 255
	MaxIconLength   = 32
	DefaultPageName = "New Page"
	DefaultPageIcon = "📄"
)

// PropRule is one key a type relies on. Check returns the value to store, or false
// when the value is not acceptable. A nil Default means the key is required.
type PropRule struct {
	Key     string
	Check   func(v any) (any, bool)
	Default func() any
}

func checkName(v any) (any, bool) {
	s, ok := v.(string)
	s = strings.TrimSpace(s)
	return s, ok && s != "" && utf8.RuneCountInString(s) <= MaxNameLength
}

func checkIcon(v any) (any, bool) {
	s, ok := v.(string)
	return s, ok && s != "" && utf8.RuneCountInString(s) <= MaxIconLength
}

func checkBool(v any) (any, bool) {
	b, ok := v.(bool)
	return b, ok
}

// checkList accepts any list, such as decoded JSON or a slice built in Go.
func checkList(v any) (any, bool) {
	return v, v != nil && reflect.ValueOf(v).Kind() == reflect.Slice
}

func checkLevel(v any) (any, bool) {
	var n float64
	switch x := v.(type) {
	case float64:
		n = x
	case int:
		n = float64(x)
	default:
		return nil, false
	}
	return int(n), n == 1 || n == 2 || n == 3
}

func constant(v any) func() any { return func() any { return v } }

var contentRule = PropRule{Key: PropContent, Check: checkList, Default: func() any { return []any{} }}

var propRules = map[ItemType][]PropRule{
	ItemTypePage: {
		{Key: PropName, Check: checkName, Default: constant(DefaultPageName)},
		{Key: PropIcon, Check: checkIcon, Default: constant(DefaultPageIcon)},
		{Key: PropIsFavorite, Check: checkBool, Default: constant(false)},
	},
	ItemTypeHeading:       {contentRule, {Key: PropLevel, Check: checkLevel}},
	ItemTypeCheckListItem: {contentRule, {Key: PropChecked, Check: checkBool, Default: constant(false)}},
}

// PropRules returns the keys a type relies on.
func PropRules(t ItemType) []PropRule {
	if rules, ok := propRules[t]; ok {
		return rules
	}
	if t.IsBlock() {
		return []PropRule{contentRule}
	}
	return nil
}

// RuleFor returns the rule a type has for key, if it relies on that key.
func RuleFor(t ItemType, key string) (PropRule, bool) {
	for _, r := range PropRules(t) {
		if r.Key == key {
			return r, true
		}
	}
	return PropRule{}, false
}

// MissingPropError means a type's required key has no acceptable value.
type MissingPropError struct {
	Type ItemType
	Key  string
}

func (e *MissingPropError) Error() string {
	return fmt.Sprintf("%s needs a valid %q", e.Type, e.Key)
}

// CompleteProps returns a copy of props holding every key the type relies on: a
// missing or unacceptable value is replaced by the key's default. It fails when a
// required key has no acceptable value. Other keys are kept as they are.
func CompleteProps(t ItemType, props Props) (Props, error) {
	out := maps.Clone(props)
	if out == nil {
		out = Props{}
	}
	for _, rule := range PropRules(t) {
		if v, ok := rule.Check(out[rule.Key]); ok {
			out[rule.Key] = v
			continue
		}
		if rule.Default == nil {
			return nil, &MissingPropError{Type: t, Key: rule.Key}
		}
		out[rule.Key] = rule.Default()
	}
	return out, nil
}
