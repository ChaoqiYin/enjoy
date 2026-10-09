import { useTranslation } from 'react-i18next';
import type { Video } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../../shared/ui/dialog';

/**
 * The question asked before a video leaves the index, and the one cost it
 * states. It is modal because the answer is the only thing to reach while it is
 * up, and Escape therefore counts as "cancel" — the answer that does nothing.
 */
export function RemoveConfirmation({
  video,
  onCancel,
  onConfirm,
}: {
  video: Video;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent closeLabel={t('close')} className="max-w-md">
        <DialogTitle className="text-base break-all">
          {t('removeQuestion', { name: video.file_name })}
        </DialogTitle>
        <DialogDescription>{t('keepFile')}</DialogDescription>
        {/* The record carries the 共享清单 mark, so removing it takes the video
            off that list as well. Said only when it is true: a warning on every
            removal is one the user learns to read past, and this one is the
            answer to "why did the television stop seeing it". */}
        {video.shared && (
          <p className="text-sm text-muted-foreground">{t('removeShared')}</p>
        )}
        <DialogFooter className="items-center gap-3">
          <Button autoFocus variant="secondary" size="lg" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" size="lg" onClick={onConfirm}>
            {t('remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
