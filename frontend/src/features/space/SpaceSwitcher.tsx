import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Tooltip } from '../../shared/Tooltip';
import { useLibraryContext } from '../library/LibraryProvider';
import { isScanRunning } from '../library/scanFeedback';
import { useSpaces } from './SpaceProvider';

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
 * Built on `details`, so the trigger and the list are one control the browser
 * already knows how to work from the keyboard: the summary takes focus and
 * toggles on Enter or Space, and the items below it are ordinary buttons and
 * links that Tab reaches in order. What the element does not do is close when
 * the choice is made, or when the user clicks away or presses Escape, so those
 * three are added here.
 */
export function SpaceSwitcher() {
  const { t } = useTranslation();
  const library = useLibraryContext();
  const { space, spaces } = useSpaces();
  // A media task holding the scan slot — a pass, a paused pass, or one file's
  // information being refreshed — is what the backend refuses a switch for, and
  // this asks the same question of the same status the scan progress reads.
  const scanning = isScanRunning(library.scan.data);
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };
  useEffect(() => {
    const away = (event: MouseEvent) => {
      const element = menu.current;
      if (element?.open && !element.contains(event.target as Node))
        element.open = false;
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  return (
    <details
      ref={menu}
      className="dropdown"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !menu.current?.open) return;
        close();
        menu.current.querySelector<HTMLElement>('summary')?.focus();
      }}
    >
      <summary
        aria-disabled={scanning || undefined}
        aria-describedby={scanning ? 'space-switch-blocked' : undefined}
        // A disabled `details` is not a thing the element knows about, and the
        // menu is what would be opened, so the click that opens it is what gets
        // stopped.
        onClick={(event) => {
          if (scanning) event.preventDefault();
        }}
        className={`btn btn-outline btn-sm btn-neutral list-none [&::-webkit-details-marker]:hidden ${scanning ? 'btn-disabled' : ''}`}
      >
        {/* The full name is ordinarily one hover away: it is the control's whole
            label, and a name too long for the row is exactly the case where the
            truncation has to be recoverable. While a scan is running the reason
            takes that place instead — the name has not become unreadable, and a
            control that will not open owes the user the reason. The same
            sentence reaches a reader who never sees a tooltip, through
            `aria-describedby` below. */}
        <Tooltip
          text={scanning ? t('spaceBlockedScanning') : space.name}
          className="min-w-0 max-w-32"
        >
          <span className="block truncate">{space.name}</span>
        </Tooltip>
        {scanning && (
          <span id="space-switch-blocked" className="sr-only">
            {t('spaceBlockedScanning')}
          </span>
        )}
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <ul className="dropdown-content menu z-30 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
        {(spaces.data ?? []).map((item) => (
          <li key={item.id}>
            <button
              aria-current={item.id === space.id || undefined}
              onClick={() => {
                close();
                if (item.id !== space.id) void library.switchSpace(item.id);
              }}
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
        <li>
          <NavLink to="/settings#spaces" onClick={close}>
            {t('spaceManage')}
          </NavLink>
        </li>
      </ul>
    </details>
  );
}
