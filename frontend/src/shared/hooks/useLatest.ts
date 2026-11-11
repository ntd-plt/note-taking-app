import * as React from 'react'

// A ref that always holds the latest value, for callbacks read from long-lived
// handlers without re-subscribing them.
export function useLatest<T>(value: T) {
  const ref = React.useRef(value)
  React.useEffect(() => {
    ref.current = value
  })
  return ref
}
