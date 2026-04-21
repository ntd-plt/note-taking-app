import { useNotes } from '../../hooks/useNotes';

const NoteList = () => {
  const { notes, selectedNote, setSelectedNote, loading, createNote } = useNotes();

  const handleNewNote = async () => {
    try {
      const newNote = await createNote('', '');
      setSelectedNote(newNote);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const stripHtml = (html) => {
    if (!html) return 'No content';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || 'No content';
  };

  const getPreview = (content) => {
    const text = stripHtml(content);
    return text.length > 80 ? text.substring(0, 80) + '...' : text || 'No content';
  };

  if (loading && notes.length === 0) {
    return (
      <div className="w-72 h-full bg-[var(--bg)] border-r border-[var(--border)] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-72 h-full bg-[var(--bg)] border-r border-[var(--border)] flex flex-col">
      <div className="p-3 border-b border-[var(--border)]">
        <button
          onClick={handleNewNote}
          className="w-full px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
        >
          + New Note
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">No notes yet</div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              onClick={() => setSelectedNote(note)}
              className={`p-3 border-b border-[var(--border)] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                selectedNote?.id === note.id ? 'bg-gray-100 dark:bg-gray-800' : ''
              }`}
            >
              <h3 className="text-sm font-medium text-[var(--text-h)] mb-1 truncate">
                {note.title || 'Untitled'}
              </h3>
              <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                {getPreview(note.content)}
              </p>
              <span className="text-xs text-gray-400">
                {formatDate(note.updated_at || note.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NoteList;