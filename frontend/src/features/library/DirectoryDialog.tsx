import { AddDirectories } from './AddDirectories';
import { useLibraryContext } from './LibraryProvider';
export function DirectoryDialog({ onClose }: { onClose: () => void }) {
  const library = useLibraryContext();
  return (
    <AddDirectories
      onClose={onClose}
      onError={library.setError}
      onConfirm={(paths) => {
        onClose();
        void library.addDirectories(paths);
      }}
    />
  );
}
