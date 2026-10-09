import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Space } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '../../shared/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../shared/ui/popover';
import { useScan } from '../library/useScan';
import { useSpaceCommands } from '../library/useSpaceCommands';
import { useShareContext } from '../share/ShareProvider';
import { useSpaces } from './SpaceProvider';

/// One width for the trigger and for the list under it, so the control does not
/// resize as spaces are renamed and the list lines up with what opened it.
const WIDTH = 'w-40';

// Nothing here is disabled while an ordinary action is in flight — playing a
// video, favouriting one — because none of those is in the way. What is in the
// way is a media task holding the scan slot, and the backend is what says so;
// the disabled trigger below is the same rule, said in advance.

/**
 * The space the interface is showing, and the list to move to another one.
 *
 * It sits in the navigation because the answer belongs to the whole page: every
 * page is a page *of* the space named here, so the name is what says which
 * library the rest of the screen is about. It is shown even when there is only
 * one space, which is how the second one is discovered rather than newly
 * appearing along with it.
 *
 * Built on `Popover`, so the anchoring, the Escape and outside-press dismissal
 * and the return of focus to the trigger are Radix's rather than restated here.
 * The list does not close itself on a choice — a popover is not a menu — so the
 * one thing this adds is closing it once the choice has been read.
 */
export function SpaceSwitcher() {
  const { t } = useTranslation();
  const { isRunning: scanning } = useScan();
  const commands = useSpaceCommands();
  const share = useShareContext();
  const { space, spaces } = useSpaces();
  const [open, setOpen] = useState(false);
  // The space the user picked while the service was running, held until they
  // have said whether they meant it. A service belongs to the space that
  // started it — it is serving a snapshot of that space's 共享清单 — so moving
  // to another one ends it, and a device in the middle of a film is the cost.
  const [pending, setPending] = useState<Space | null>(null);
  function choose(item: Space) {
    setOpen(false);
    if (item.id === space.id) return;
    if (share.port !== null) {
      setPending(item);
      return;
    }
    void commands.switchSpace(item.id);
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`${WIDTH} justify-between`}
            // A disabled `button` is one the click never reaches, which is
            // exactly what "will not open" means; `aria-disabled` says the same
            // thing to assistive technology without hiding the reason below.
            disabled={scanning}
            aria-disabled={scanning || undefined}
            aria-describedby={scanning ? 'space-switch-blocked' : undefined}
          >
            {/* A name too long for the fixed width is cut here, and is read in
                full in the list below — the same click that would open a
                tooltip opens that list, and it has room to wrap. So nothing
                repeats the name on hover. While a scan is running the control
                will not open, and the reason reaches assistive technology
                through `aria-describedby`; the settings section states it in
                sight as well. */}
            <span className="min-w-0 flex-1 truncate text-left">
              {space.name}
            </span>
            {scanning && (
              <span id="space-switch-blocked" className="sr-only">
                {t('spaceBlockedScanning')}
              </span>
            )}
            <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={`${WIDTH} p-1.5`}>
          <ul className="flex flex-col">
            {(spaces.data ?? []).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === space.id || undefined}
                  onClick={() => choose(item)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <Check
                    size={14}
                    aria-hidden="true"
                    className={item.id === space.id ? '' : 'invisible'}
                  />
                  <span className="break-all">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      {pending && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setPending(null);
          }}
        >
          {/* The question is the dialog's own name, which is what Radix points
              `aria-labelledby` at, so it is the title here rather than a
              heading of its own styling. */}
          <DialogContent closeLabel={t('close')} className="max-w-md">
            <DialogTitle className="text-sm leading-normal font-normal break-all">
              {t('spaceSwitchQuestion', { name: pending.name })}
            </DialogTitle>
            <DialogFooter className="items-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setPending(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                size="lg"
                onClick={async () => {
                  // The question is answered, so it comes down before anything
                  // is attempted: a service that will not stop is reported by
                  // the notice at the corner of the screen, and a modal in
                  // front of it is a failure the user cannot read.
                  const target = pending;
                  setPending(null);
                  // And the move happens only if the service really ended.
                  // Moving anyway would leave it serving the space that is no
                  // longer on screen, which is the one state these two concepts
                  // have to be kept apart in.
                  if (!(await share.stop())) return;
                  await commands.switchSpace(target.id);
                }}
              >
                {t('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
