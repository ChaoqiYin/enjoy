import { FolderMinus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { displayPath } from '../../shared/format';
import { Button } from '../../shared/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../shared/ui/popover';

/**
 * One configured folder, and the one destructive control over it.
 *
 * The question is asked in place rather than in a window: the row is what the
 * answer is about, and the row is still on screen while it is asked. Radix owns
 * the anchoring, the Escape and outside-press dismissal and the return of
 * focus, which is what this had to spell out for itself before.
 *
 * `status` and `meta` are slots for what the row may come to say about the
 * folder — whether it is reachable, how much it holds — so that adding one does
 * not reshape the row.
 */
export function DirectoryRow({
  path,
  status,
  meta,
  onRemove,
  disabled = false,
}: {
  path: string;
  status?: ReactNode;
  meta?: ReactNode;
  onRemove: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The verbatim prefix some platforms put on these paths is noise here, so the
  // row shows the form that reads as a folder.
  const shown = displayPath(path);
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <span className="flex-1 font-mono break-all">{shown}</span>
      {status}
      {meta}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-destructive"
            aria-label={t('removeFolder')}
            disabled={disabled}
          >
            <FolderMinus size={14} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <p className="text-sm break-all">
            {t('removeQuestion', { name: shown })}
          </p>
          <div className="flex items-center justify-end gap-3 pt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setOpen(false);
                void onRemove();
              }}
            >
              {t('confirm')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
