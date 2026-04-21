import Sidebar from './Sidebar';
import NoteList from './NoteList';
import NoteEditor from './NoteEditor';

const AppLayout = () => {
  return (
    <div className="flex h-screen bg-[var(--bg)]">
      <Sidebar />
      <NoteList />
      <NoteEditor />
    </div>
  );
};

export default AppLayout;