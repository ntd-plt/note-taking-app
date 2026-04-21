import { useState, useEffect, useCallback } from 'react';
import { useNotes } from '../../hooks/useNotes';
import RichTextEditor from '../editor/RichTextEditor';

const NoteEditorContent = ({ note, onSave, onDelete }) => {
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (title !== note?.title || content !== note?.content) {
        setIsSaving(true);
        onSave(note.id, title, content)
          .then(() => setLastSaved(new Date()))
          .finally(() => setIsSaving(false));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content, note, onSave]);

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      await onDelete(note.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)]">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="flex-1 text-xl font-medium bg-transparent border-none outline-none text-[var(--text-h)] placeholder-gray-400"
        />
        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="text-xs text-gray-400">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          {isSaving && (
            <span className="text-xs text-gray-400">Saving...</span>
          )}
          <button
            onClick={() => onSave(note.id, title, content)}
            disabled={isSaving}
            className="px-3 py-1.5 text-sm bg-[var(--accent)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder="Start writing..."
        />
      </div>
    </div>
  );
};

const NoteEditor = () => {
  const { selectedNote, updateNote, deleteNote } = useNotes();

  const handleSave = useCallback(async (id, title, content) => {
    await updateNote(id, title, content);
  }, [updateNote]);

  const handleDelete = useCallback(async (id) => {
    await deleteNote(id);
  }, [deleteNote]);

  if (!selectedNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>Select a note or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <NoteEditorContent
      key={selectedNote.id}
      note={selectedNote}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
};

export default NoteEditor;