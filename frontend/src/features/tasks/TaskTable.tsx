import { useTranslation } from 'react-i18next';
import { ListTodo, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { TaskAction, TaskRow } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table';
import { Tooltip } from '../../shared/Tooltip';
import { formatDateTime } from '../../shared/format';
import { EmptyState } from '../library/EmptyState';

type TaskTableProps = {
  tasks: TaskRow[];
  onAction: (taskId: number, action: TaskAction) => void;
};

/**
 * The state as the user reads it: a task that was told to pause or to stop is
 * still `running` in storage until the worker acknowledges, and the page says
 * so rather than showing a state that contradicts the button just pressed.
 */
function displayState(task: TaskRow) {
  if (task.state === 'running' && task.pause_requested) return 'pausing';
  if (task.state === 'running' && task.cancel_requested) return 'cancelling';
  return task.state;
}

/** Where the task points: the space it runs in, and what it is about. */
function targetOf(task: TaskRow, allVideos: string) {
  if (task.video_name) return `${task.space_name} · ${task.video_name}`;
  if (task.video_id != null) return `${task.space_name} · ${task.video_id}`;
  return `${task.space_name} · ${allVideos}`;
}

function progressOf(task: TaskRow) {
  const label = task.progress_label ? ` ${task.progress_label}` : '';
  if (task.progress_current != null && task.progress_total != null) {
    return `${task.progress_current}/${task.progress_total}${label}`;
  }
  if (task.progress_current != null) return `${task.progress_current}${label}`;
  return task.progress_label ?? '-';
}

/**
 * Every action a task in this state can be given. Finished tasks — done and
 * cancelled — are not steered any more, and a pause already asked for is not
 * asked for twice.
 *
 * A pause that is only asked for can be taken back: the row says 暂停中 while
 * the worker has not acknowledged it yet, and 继续 is how the user says they
 * did not mean it. The pass is still running at that point, so the request is
 * a request about the run and not about a task that has already stopped.
 */
function actionsOf(task: TaskRow) {
  const canPause =
    task.state === 'pending' ||
    (task.state === 'running' && !task.pause_requested);
  const canResume =
    task.state === 'paused' ||
    (task.state === 'running' && task.pause_requested);
  const canCancel =
    task.state === 'pending' ||
    task.state === 'running' ||
    task.state === 'paused';
  const canRetry = task.state === 'failed';
  return { canPause, canResume, canCancel, canRetry };
}

/**
 * The task listing, filtered upstream by the page.
 *
 * The rows are cells of a table rather than cards because nine columns of
 * facts are what this page is for: each action is an icon button wearing the
 * interface's standard outline shape with its semantic color as text, every
 * one carrying a prompt and a name (界面约定 · 按钮样式).
 */
export function TaskTable({ tasks, onAction }: TaskTableProps) {
  const { t, i18n } = useTranslation();

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ListTodo />}
        title={t('tasksEmpty')}
        message={t('tasksEmptyMessage')}
      />
    );
  }

  const states: Record<string, string> = {
    pending: t('taskStatePending'),
    running: t('taskStateRunning'),
    paused: t('taskStatePaused'),
    done: t('taskStateDone'),
    failed: t('taskStateFailed'),
    cancelled: t('taskStateCancelled'),
    pausing: t('taskPausing'),
    cancelling: t('taskCancelling'),
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="whitespace-nowrap">{t('taskSource')}</TableHead>
          <TableHead className="whitespace-nowrap">{t('taskTarget')}</TableHead>
          <TableHead className="whitespace-nowrap">{t('taskKind')}</TableHead>
          <TableHead className="whitespace-nowrap">{t('taskState')}</TableHead>
          <TableHead className="whitespace-nowrap">
            {t('taskProgress')}
          </TableHead>
          <TableHead className="whitespace-nowrap">
            {t('taskAttempts')}
          </TableHead>
          <TableHead className="min-w-[10rem] max-w-[200px]">
            {t('taskLastError')}
          </TableHead>
          <TableHead className="whitespace-nowrap">
            {t('taskUpdatedAt')}
          </TableHead>
          <TableHead className="whitespace-nowrap">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => {
          const { canPause, canResume, canCancel, canRetry } = actionsOf(task);
          return (
            <TableRow key={task.id}>
              <TableCell className="whitespace-nowrap">
                {task.plugin ?? t('taskSourceKernel')}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {targetOf(task, t('taskAllVideos'))}
              </TableCell>
              <TableCell className="whitespace-nowrap">{task.kind}</TableCell>
              <TableCell className="whitespace-nowrap">
                {states[displayState(task)] ?? displayState(task)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {progressOf(task)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {task.attempts}
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                <Tooltip
                  asChild
                  text={task.last_error ?? ''}
                  disabled={!task.last_error}
                  delayDuration={700}
                >
                  <span>{task.last_error ?? '-'}</span>
                </Tooltip>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDateTime(task.updated_at, i18n.language)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {canPause ? (
                    <Tooltip text={t('pause')}>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="text-warning"
                        aria-label={t('pause')}
                        onClick={() => onAction(task.id, 'pause')}
                      >
                        <Pause size={14} aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  ) : null}
                  {canResume ? (
                    <Tooltip text={t('resume')}>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="text-success"
                        aria-label={t('resume')}
                        onClick={() => onAction(task.id, 'resume')}
                      >
                        <Play size={14} aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  ) : null}
                  {canRetry ? (
                    <Tooltip text={t('retry')}>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="text-primary"
                        aria-label={t('retry')}
                        onClick={() => onAction(task.id, 'retry')}
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  ) : null}
                  {canCancel ? (
                    <Tooltip text={t('cancel')}>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={t('cancel')}
                        onClick={() => onAction(task.id, 'cancel')}
                      >
                        <X size={14} aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
