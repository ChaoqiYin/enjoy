import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Video } from '../../shared/api';

export function MaintenanceButton({
  video,
  action,
  variant,
  icon,
  label,
  disabled = false,
}: {
  video: Video;
  action: (video: Video) => void | Promise<unknown>;
  variant: 'primary' | 'secondary';
  icon: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn btn-soft btn-md btn-${variant}`}
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        void Promise.resolve(action(video)).finally(() => setBusy(false));
      }}
    >
      {busy ? <span className="loading loading-spinner" /> : icon}
      {label}
    </button>
  );
}
