import { AddDirectories } from './AddDirectories';
import { useLibraryContext } from './LibraryProvider';
import { directoryScanAction } from './scanDirectories';
export function DirectoryDialog({ onClose }: { onClose: () => void }) {
  const library = useLibraryContext();
  return (
    <AddDirectories
      onClose={onClose}
      onError={library.setError}
      onScan={(paths) => {
        onClose();
        void library.run(directoryScanAction(paths));
      }}
    />
  );
}
