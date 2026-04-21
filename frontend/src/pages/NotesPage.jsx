import { useEffect } from 'react';
import { useNotes } from '../hooks/useNotes';
import AppLayout from '../components/layout/AppLayout';

const NotesPage = () => {
  const { fetchNotes, notes } = useNotes();

  useEffect(() => {
    if (notes.length === 0) {
      fetchNotes();
    }
  }, [fetchNotes, notes.length]);

  return <AppLayout />;
};

export default NotesPage;