import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Editor from './Editor'
import { vi, describe, it, expect } from 'vitest'

// Mock tanstack router navigation
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ noteId: 'test-note-id' }),
}))

// Helper to render Editor inside necessary context providers
function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <Editor />
    </QueryClientProvider>,
  )
}

describe('Editor Component', () => {
  it('should render editor successfully without crashing', async () => {
    // Intercept MSW routes if needed, but the default mock data is handled by msw/browser or node
    renderEditor()

    // Wait for the note to load and placeholder/content to render
    await waitFor(() => {
      // It should either render "No Page Selected" or the editor container
      const noPageSelected = screen.queryByText(/No Page Selected/i)
      const editorElement = document.querySelector('.tiptap')
      expect(noPageSelected || editorElement).not.toBeNull()
    })
  })
})
