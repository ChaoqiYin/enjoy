import { AddDirectories } from './AddDirectories';
import { useDirectories } from './useDirectories';
import { useNotices } from './useNotices';
export function DirectoryDialog({ onClose }: { onClose: () => void }) {
  const { setError } = useNotices();
  const { addDirectories } = useDirectories();
  return (
    <AddDirectories
      onClose={onClose}
      onError={setError}
      onConfirm={(paths) => {
        onClose();
        void addDirectories(paths);
      }}
    />
  );
}
