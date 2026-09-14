import { AddDirectories } from './AddDirectories';
import { useLibraryContext } from './LibraryProvider';
import { libraryApi } from '../../shared/api';
import { directoryScanAction } from './scanDirectories';
export function DirectoryDialog({ onClose }: { onClose: () => void }) {
  const library = useLibraryContext();
  return (
    <AddDirectories
      onClose={onClose}
      onError={library.setError}
      onScan={(paths) => {
        onClose();
        void library.run(async () => { for (const path of paths) await libraryApi.addDirectory(path); });
      }}
    />
  );
}
