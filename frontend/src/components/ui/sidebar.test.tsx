import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sidebar, SidebarProvider, SidebarRail } from './sidebar'

afterEach(() => {
  cleanup()
  document.cookie = 'sidebar_width=; max-age=0; path=/'
})

function setup() {
  const { container } = render(
    <SidebarProvider>
      <Sidebar>
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>,
  )
  const wrapper = container.querySelector<HTMLElement>(
    '[data-slot="sidebar-wrapper"]',
  )!
  const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]')!
  const drag = (...xs: number[]) => {
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Resize Sidebar' }),
    )
    for (const x of xs) fireEvent.pointerMove(window, { clientX: x })
    fireEvent.pointerUp(window)
  }
  return {
    drag,
    width: () => wrapper.style.getPropertyValue('--sidebar-width'),
    state: () => sidebar.dataset.state,
  }
}

describe('SidebarRail', () => {
  it('resizes within the bounds', () => {
    const s = setup()
    s.drag(300)
    expect(s.width()).toBe('300px')
    s.drag(150)
    expect(s.width()).toBe('180px')
    expect(s.state()).toBe('expanded')
  })

  it('hides the sidebar when dragged below the threshold, keeping its width', () => {
    const s = setup()
    s.drag(300, 100)
    expect(s.state()).toBe('collapsed')
    expect(s.width()).toBe('300px')
  })

  it('shows it again when dragged back out in the same drag', () => {
    const s = setup()
    s.drag(100, 250)
    expect(s.state()).toBe('expanded')
    expect(s.width()).toBe('250px')
  })
})
