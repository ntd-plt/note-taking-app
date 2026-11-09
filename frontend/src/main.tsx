import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { startThemeSync } from './shared/lib/theme'
import { setUnauthorizedHandler } from './shared/api/client'
import { endSession } from './shared/hooks/useSession'

startThemeSync()

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

// The session ended on the server (expired, or logged out on another device):
// forget the cached data and go to the login page.
setUnauthorizedHandler(() => {
  endSession(queryClient)
  const path = router.state.location.pathname
  if (path !== '/login' && path !== '/signup') {
    void router.navigate({ to: '/login' })
  }
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function enableMocking() {
  const shouldMock =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK === 'true'

  if (shouldMock) {
    const { worker } = await import('./mocks/browser')
    return worker.start({
      onUnhandledRequest: 'bypass',
    })
  } else {
    // Unregister any active service worker (e.g. old MSW registrations) to prevent persistent request interception
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
        }
      } catch (err) {
        console.error('Failed to unregister service worker:', err)
      }
    }
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  enableMocking().then(() => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    )
  })
}
