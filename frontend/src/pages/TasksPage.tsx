import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageFrame } from '../features/library/PageFrame';
import { ScrollViewport } from '../shared/ScrollViewport';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../shared/ui/select';
import { useTasks } from '../features/tasks/useTasks';
import { TaskTable } from '../features/tasks/TaskTable';

/**
 * Everything the task queue is doing, with the two filters the page owns.
 *
 * The narrowing is done here rather than in the table: the filter sources are
 * derived from the loaded tasks, and only one listing stands behind them —
 * the kernel is never asked twice for a choice the page can answer itself.
 */
export function TasksPage() {
  const { t } = useTranslation();
  const { tasks, act } = useTasks();
  const [sourceFilter, setSourceFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');

  const sources = useMemo(() => {
    const seen = new Set<string>();
    for (const task of tasks) seen.add(task.plugin ?? 'kernel');
    return Array.from(seen);
  }, [tasks]);

  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        if (
          sourceFilter !== 'all' &&
          (task.plugin ?? 'kernel') !== sourceFilter
        ) {
          return false;
        }
        if (stateFilter !== 'all' && task.state !== stateFilter) return false;
        return true;
      }),
    [tasks, sourceFilter, stateFilter],
  );

  return (
    <PageFrame>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]" aria-label={t('taskSource')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('taskSourceAll')}</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source} value={source}>
                {source === 'kernel' ? t('taskSourceKernel') : source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[160px]" aria-label={t('taskState')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('taskStateAll')}</SelectItem>
            <SelectItem value="pending">{t('taskStatePending')}</SelectItem>
            <SelectItem value="running">{t('taskStateRunning')}</SelectItem>
            <SelectItem value="paused">{t('taskStatePaused')}</SelectItem>
            <SelectItem value="done">{t('taskStateDone')}</SelectItem>
            <SelectItem value="failed">{t('taskStateFailed')}</SelectItem>
            <SelectItem value="cancelled">{t('taskStateCancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ScrollViewport className="min-h-0">
        <TaskTable
          tasks={visible}
          onAction={(taskId, action) => {
            void act(taskId, action);
          }}
        />
      </ScrollViewport>
    </PageFrame>
  );
}
