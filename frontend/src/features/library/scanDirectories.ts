import { libraryApi } from '../../shared/api';

export function directoryScanAction(paths: readonly string[]) {
  const directories = [...new Set(paths)];
  return () => libraryApi.rescan(directories);
}
