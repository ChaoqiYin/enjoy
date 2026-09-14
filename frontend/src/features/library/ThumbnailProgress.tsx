import type { ScanStatus } from '../../shared/api';
import { ScanProgress } from './ScanProgress';

export function ThumbnailProgress({
  status,
  onAction,
}: {
  status: ScanStatus;
  onAction: (action: 'pause' | 'resume' | 'cancel') => void;
}) {
  return (
    <ScanProgress status={status} onAction={onAction} operation="thumbnails" />
  );
}
