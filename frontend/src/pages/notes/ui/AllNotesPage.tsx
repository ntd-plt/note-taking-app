import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AllNotesPage() {
  // Sample notes data
  const notes = [
    {
      id: 1,
      title: 'Meeting Notes',
      content: 'Discussed project timeline with the team...',
      date: '2024-01-15',
      tags: ['work', 'meeting'],
    },
    {
      id: 2,
      title: 'Shopping List',
      content: 'Milk, Eggs, Bread, Coffee...',
      date: '2024-01-14',
      tags: ['personal'],
    },
    {
      id: 3,
      title: 'Project Ideas',
      content: 'Brainstorming session for new features...',
      date: '2024-01-13',
      tags: ['work', 'ideas'],
    },
    {
      id: 4,
      title: 'Recipe Collection',
      content: 'Italian pasta recipe with fresh ingredients...',
      date: '2024-01-12',
      tags: ['cooking', 'personal'],
    },
    {
      id: 5,
      title: 'Learning Resources',
      content: 'List of React and TypeScript tutorials...',
      date: '2024-01-11',
      tags: ['learning', 'work'],
    },
    {
      id: 6,
      title: 'Travel Plans',
      content: 'Itinerary for summer vacation...',
      date: '2024-01-10',
      tags: ['travel', 'personal'],
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Notes</h1>
            <p className="text-muted-foreground">
              Your personal notes collection
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Note
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <Label htmlFor="search" className="mb-2 block">
                  Search Notes
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by title, content, or tags..."
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="sort" className="mb-2 block">
                  Sort By
                </Label>
                <select
                  id="sort"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="title">Title A-Z</option>
                </select>
              </div>
              <div>
                <Label htmlFor="filter" className="mb-2 block">
                  Filter by Tag
                </Label>
                <select
                  id="filter"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">All Tags</option>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="meeting">Meeting</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes Grid */}
      <div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <Card key={note.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{note.title}</CardTitle>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{note.date}</span>
                  <div className="flex gap-1">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-secondary px-2 py-1 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-muted-foreground">
                  {note.content}
                </p>
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {notes.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <div className="mx-auto max-w-md">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No notes found</h3>
                <p className="text-muted-foreground mt-2">
                  Create your first note by clicking the "New Note" button
                  above.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats */}
      <div className="mt-8">
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Notes</p>
                <p className="text-2xl font-bold">{notes.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Work Notes</p>
                <p className="text-2xl font-bold">
                  {notes.filter((n) => n.tags.includes('work')).length}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Personal Notes</p>
                <p className="text-2xl font-bold">
                  {notes.filter((n) => n.tags.includes('personal')).length}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">
                  {
                    notes.filter((n) => {
                      const noteDate = new Date(n.date)
                      const weekAgo = new Date()
                      weekAgo.setDate(weekAgo.getDate() - 7)
                      return noteDate >= weekAgo
                    }).length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
