import type { Note } from '../model'

const initialNotes: Note[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    parentId: null,
    isFavorite: true,
    isExpanded: true,
    icon: '🚀',
    content: `
      <h2>Welcome to your new workspace!</h2>
      <p>This is a Notion-like note-taking application designed with a focus on rich visual aesthetics and highly polished interactions.</p>
      <p></p>
      <h3>💡 How to use the Editor:</h3>
      <ul>
        <li>Click anywhere and start typing to write content.</li>
        <li>Type <code>/</code> (slash) on a empty line to open the <strong>Slash Command Menu</strong>.</li>
        <li>Hover over a block to reveal the **Drag Handle**, which lets you change block type or delete it.</li>
      </ul>
      <p></p>
      <h3>📂 Notion Sidebar features:</h3>
      <ul>
        <li><strong>Collapsible hierarchy</strong>: Click the arrow next to a note to reveal sub-notes.</li>
        <li><strong>Quick Actions</strong>: Hover over any sidebar item to add a sub-note (<code>+</code>) or open options (<code>...</code>).</li>
        <li><strong>Favorites</strong>: Star your most important notes for quick access at the top.</li>
        <li><strong>Quick Find</strong>: Click "Quick Find" or press <code>Ctrl+K</code> to instantly search across all notes.</li>
      </ul>
    `,
    createdAt: new Date('2026-05-30T10:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T10:00:00.000Z').toISOString(),
  },
  {
    id: 'work-space',
    title: '💼 Work',
    parentId: null,
    isFavorite: false,
    isExpanded: true,
    icon: '💼',
    content: `
      <h2>Work Workspace</h2>
      <p>Manage your projects, team documents, and meetings here.</p>
      <p>Create nested notes inside this folder to organize weekly syncs, plans, and task lists.</p>
    `,
    createdAt: new Date('2026-05-30T11:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T11:00:00.000Z').toISOString(),
  },
  {
    id: 'weekly-sync',
    title: 'Weekly Team Sync',
    parentId: 'work-space',
    isFavorite: true,
    isExpanded: false,
    icon: '📅',
    content: `
      <h2>Weekly Team Sync - May 31, 2026</h2>
      <p><strong>Attendees:</strong> Lam Tung, Alex, Emily, Michael</p>
      <p></p>
      <h3>📋 Agenda</h3>
      <ul>
        <li>Product launch roadmap and review</li>
        <li>Design updates for Sidebar Navigation</li>
        <li>Sprint planning and backlog review</li>
      </ul>
      <p></p>
      <h3>📝 Actions & Updates</h3>
      <p>Tung is building the new Notion-like sidebar component today! The sidebar will support collapsible sub-pages and quick actions.</p>
    `,
    createdAt: new Date('2026-05-31T09:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T09:00:00.000Z').toISOString(),
  },
  {
    id: 'product-roadmap',
    title: 'Q3 Product Roadmap',
    parentId: 'work-space',
    isFavorite: false,
    isExpanded: false,
    icon: '🎯',
    content: `
      <h2>🎯 Q3 Product Roadmap</h2>
      <p>Here is our high-level visual roadmap for Q3.</p>
      <ul>
        <li><strong>July</strong>: Offline storage sync & workspace export.</li>
        <li><strong>August</strong>: Realtime collaborative multi-user editing.</li>
        <li><strong>September</strong>: Canvas-style visual whiteboard blocks.</li>
      </ul>
    `,
    createdAt: new Date('2026-05-31T09:30:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T09:30:00.000Z').toISOString(),
  },
  {
    id: 'personal-space',
    title: '🏠 Personal',
    parentId: null,
    isFavorite: false,
    isExpanded: true,
    icon: '🏠',
    content: `
      <h2>Personal Vault</h2>
      <p>A place for your journals, reading list, travel plans, and fitness logs.</p>
    `,
    createdAt: new Date('2026-05-30T12:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T12:00:00.000Z').toISOString(),
  },
  {
    id: 'groceries',
    title: '🛒 Grocery List',
    parentId: 'personal-space',
    isFavorite: false,
    isExpanded: false,
    icon: '🛒',
    content: `
      <h2>🛒 Grocery List</h2>
      <p>Pick up on Sunday:</p>
      <ul>
        <li>Fresh sourdough bread 🥖</li>
        <li>Organic Hass avocados 🥑</li>
        <li>Greek yogurt & Blueberries 🫐</li>
        <li>Cold brew coffee beans ☕</li>
      </ul>
    `,
    createdAt: new Date('2026-05-31T08:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T08:00:00.000Z').toISOString(),
  },
  {
    id: 'movies-to-watch',
    title: 'Movies to Watch',
    parentId: 'personal-space',
    isFavorite: false,
    isExpanded: false,
    icon: '🎬',
    content: `
      <h2>🎬 Movies & Shows reading list</h2>
      <p>Recommended by friends:</p>
      <ul>
        <li><strong>Dune: Part Two</strong> (Sci-fi masterpiece)</li>
        <li><strong>Severance Season 2</strong> (Mind-bending workplace mystery)</li>
        <li><strong>Interstellar</strong> (Rewatch in IMAX if possible)</li>
      </ul>
    `,
    createdAt: new Date('2026-05-31T08:30:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T08:30:00.000Z').toISOString(),
  },
]

export default initialNotes
