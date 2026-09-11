import { libraryApi } from '../../shared/api';

export function directoryScanAction(paths: readonly string[]) {
  const pending = [...new Set(paths)];
  let index = 0;
  return async () => {
    while (index < pending.length) {
      await libraryApi.scan(pending[index]);
      index += 1;
    }
  };
}
