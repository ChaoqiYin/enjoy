import { FolderPlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useCommand } from '../../shared/useCommand';
import { pickDirectories } from '../../shared/api';
import type { AppError } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { Tooltip } from '../../shared/Tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog';

interface Props {
  onClose: () => void;
  onConfirm: (paths: string[]) => void;
  onError: (error: AppError) => void;
}

export function AddDirectories({ onClose, onConfirm, onError }: Props) {
  const { t } = useTranslation();
  const [paths, setPaths] = useState<string[]>([]);
  // A picker that would not open is not about the folders already chosen, so
  // the failure goes to the notice the caller keeps rather than beside this
  // list.
  const { busy: choosing, run } = useCommand(onError);
  function choose() {
    return run(undefined, async () => {
      const selected = await pickDirectories();
      if (selected)
        setPaths((current) => [...new Set([...current, ...selected])]);
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('addVideos')}</DialogTitle>
          <DialogDescription>{t('chooseHelp')}</DialogDescription>
        </DialogHeader>
        {paths.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noFolders')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {paths.map((path) => (
              <li
                key={path}
                className="flex items-center gap-3 rounded-lg bg-muted p-3"
              >
                <span className="flex-1 font-mono text-sm break-all">
                  {path}
                </span>
                {/* The row already spells the path out, so the tooltip says
                    only what the press does — the words on the screen would be
                    said twice. The name keeps the path, because a reader who
                    cannot see the row has nothing else to tell one identical
                    bin button from the next. */}
                <Tooltip text={t('remove')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    aria-label={t('removePath', { path })}
                    onClick={() =>
                      setPaths((current) =>
                        current.filter((value) => value !== path),
                      )
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="lg"
          className="gap-3"
          disabled={choosing}
          onClick={choose}
        >
          <FolderPlus size={18} aria-hidden="true" />
          {t('chooseFolder')}
        </Button>
        <DialogFooter className="items-center gap-3">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="lg"
            disabled={choosing || paths.length === 0}
            onClick={() => onConfirm(paths)}
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
