// Who is logged in, as the server says. Route guards read it through the query
// client (ensureQueryData), components through useSession; login, signup and
// logout write it, so it never needs a second request after them.
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { fetchCurrentUser } from '../api/auth'
import type { User } from '../models'

export const sessionQuery = queryOptions({
  queryKey: ['session'] as const,
  queryFn: fetchCurrentUser,
  // A session lasts days; refetching on every focus would be noise. A 401 from
  // any other request resets it (see setUnauthorizedHandler in main.tsx).
  staleTime: 5 * 60 * 1000,
})

export function useSession() {
  return useQuery(sessionQuery)
}

// startSession records a fresh login. Anything cached for whoever used this
// browser before is dropped first.
export function startSession(queryClient: QueryClient, user: User) {
  queryClient.clear()
  queryClient.setQueryData(sessionQuery.queryKey, user)
}

// endSession forgets everything cached for the user who just logged out.
export function endSession(queryClient: QueryClient) {
  queryClient.clear()
  queryClient.setQueryData(sessionQuery.queryKey, null)
}
