import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import { Badge } from './ui/badge';

/**
 * Whether the 共享服务 is running, at the right end of the header.
 *
 * The words are the answer and the dot is the glance. A lamp whose meaning
 * lived only in its colour would be one a user has to have been told about
 * already, so the dot is taken out of the reading — `aria-hidden` — and the
 * status itself is what a reader is given, both as the pill's name and as the
 * text beside the dot. The pointer's question is a different one — *where* the
 * service is, not whether it is up — so the port is on the prompt, which the
 * pill itself opens (`asChild`); the prompt does not repeat 「在线」.
 *
 * This is the only place the state is drawn. The 共享 entry in the navigation
 * used to hang a second lamp on the same fact, and two lamps for one fact say
 * nothing the one does not.
 */
export function ShareStatusPill({
  running,
  port,
}: {
  running: boolean;
  /** The port the service is listening on, or null when it is not running. */
  port: number | null;
}) {
  const { t } = useTranslation();
  const label = t(running ? 'lanOnline' : 'lanOffline');
  return (
    <Tooltip text={t(running ? 'sharingOn' : 'sharingOff', { port })} asChild>
      <Badge
        // A live region, so a service that starts or ends while the user is
        // elsewhere in the window is said rather than silently redrawn.
        role="status"
        aria-label={label}
        data-state={running ? 'running' : 'idle'}
        className="gap-1.5 bg-muted/50 px-2.5 py-1 text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${running ? 'bg-share' : 'bg-muted-foreground'}`}
        />
        {label}
      </Badge>
    </Tooltip>
  );
}
