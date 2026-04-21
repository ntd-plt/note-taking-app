/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback } from 'react';
import { noteService } from '../services/noteService';

export const NotesContext = createContext(null);

export const NotesProvider = ({ children }) => {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await noteService.getAll();
      setNotes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createNote = async (title, content) => {
    try {
      const newNote = await noteService.create(title, content);
      setNotes((prev) => [newNote, ...prev]);
      return newNote;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateNote = async (id, title, content) => {
    try {
      const updated = await noteService.update(id, title, content);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      if (selectedNote?.id === id) {
        setSelectedNote(updated);
      }
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteNote = async (id) => {
    try {
      await noteService.delete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNote?.id === id) {
        setSelectedNote(null);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const searchNotes = async (query) => {
    if (!query.trim()) {
      await fetchNotes();
      return;
    }
    setLoading(true);
    try {
      const results = await noteService.search(query);
      setNotes(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <NotesContext.Provider
      value={{
        notes,
        selectedNote,
        setSelectedNote,
        loading,
        error,
        fetchNotes,
        createNote,
        updateNote,
        deleteNote,
        searchNotes,
      }}
    >
      {children}
    </NotesContext.Provider>
  );
};