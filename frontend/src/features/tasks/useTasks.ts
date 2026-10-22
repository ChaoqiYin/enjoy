import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { backendEvents, normalizeError, taskApi } from '../../shared/api';
import type { TaskAction } from '../../shared/api';
import { useNotices } from '../library/useNotices';

export const TASKS_QUERY_KEY = ['tasks'] as const;

/**
 * How long a burst of change events is held before the listing is re-read.
 * The first event is answered at once — a single task the user just acted on
 * must show its new state without waiting — and the ones that follow inside
 * the window ride along behind it, because a queue draining emits a change
 * per task and re-reading per event would put the backend under a load the
 * user cannot see the benefit of.
 */
const THROTTLE_MS = 500;

/**
 * The task listing, and the one subscription that keeps it current.
 *
 * There is no polling anywhere in this hook: `task-changed` is the backend
 * saying a task moved, and that is the only thing that redraws the page.
 */
export function useTasks() {
  const queryClient = useQueryClient();
  const notices = useNotices();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const query = useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: async () => {
      try {
        return await taskApi.list();
      } catch (error) {
        // Nothing on this page can be read if the listing cannot, so this
        // failure belongs to the shared corner and not to any control here.
        notices.setError(normalizeError(error));
        throw error;
      }
    },
    retry: false,
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    backendEvents
      .onTaskChanged(() => {
        if (timer.current) {
          held.current = true;
          return;
        }
        held.current = false;
        timer.current = setTimeout(() => {
          timer.current = null;
          if (held.current) {
            held.current = false;
            void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
          }
        }, THROTTLE_MS);
        void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      })
      .then((stop) => {
        // The page may be gone by the time the subscription lands; the
        // listener is still worth closing either way.
        if (disposed) stop();
        else unlisten = stop;
      });
    return () => {
      disposed = true;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      held.current = false;
      unlisten?.();
    };
  }, [queryClient]);

  /**
   * One action, one command. A failure the kernel describes — or anything
   * else that went wrong — is reported through the notices and stays there;
   * this function does not throw, so the page's fire-and-forget call cannot
   * become an unhandled rejection.
   */
  const act = useMemo(
    () => async (taskId: number, action: TaskAction) => {
      try {
        await taskApi.action(taskId, action);
        await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      } catch (error) {
        notices.setError(normalizeError(error));
      }
    },
    [notices, queryClient],
  );

  return { tasks: query.data ?? [], act };
}
