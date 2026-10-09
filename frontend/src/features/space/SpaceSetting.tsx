import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Space } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../shared/ui/popover';
import { useBusy } from '../library/useBusy';
import { useScan } from '../library/useScan';
import { useSpaceCommands } from '../library/useSpaceCommands';
import { useSpaces } from './SpaceProvider';
import { SpaceDialog } from './SpaceDialog';

/**
 * The one destructive control on a row, and the question it asks in place
 * rather than in a window: deleting a space is not a path to walk through, so
 * the answer belongs beside the row it is about. Radix owns the anchoring, the
 * Escape and outside-press dismissal and the return of focus, which is what the
 * inline confirmation had to spell out for itself before.
 *
 * There is no tooltip on it. The name is on the control for assistive
 * technology, and opening the question is one click either way — the same
 * bargain the space list's rows already make.
 */
function SpaceRemove({
  name,
  disabled,
  onConfirm,
}: {
  name: string;
  disabled: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          aria-label={t('spaceRemove')}
          disabled={disabled}
        >
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="text-sm break-all">
          {t('spaceRemoveQuestion', { name })}
        </p>
        <div className="flex items-center justify-end gap-3 pt-3">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            {t('confirm')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The spaces the application holds: the list, which one the interface is
 * showing, and the three things that can be done to the set of them.
 *
 * The rows are deliberately unlike the directory rows further down the page:
 * those are containers of a path each, and these are one short name and two
 * buttons. A card per space would read as the same kind of thing and take three
 * times the height, so the list is one bordered block of tight rows instead.
 *
 * A refused name is reported by the dialog, beside the field it is about. A
 * refused deletion is not: nothing about it is local to the row, so it goes out
 * through the library's notice, where every other action that could not be
 * carried out is reported.
 */
export function SpaceSetting() {
  const { t } = useTranslation();
  const { busy } = useBusy();
  const { isRunning: scanning } = useScan();
  const commands = useSpaceCommands();
  const { space, spaces } = useSpaces();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Space | null>(null);
  // The same slot the switch asks about: a pass, a paused pass, or one file's
  // information being refreshed. The backend refuses these operations for the
  // reason above the buttons; this is that rule said in advance. Two different
  // questions, from the two modules that own them: is a media task holding the
  // slot, and is a command of the interface still in flight.
  const blocked = busy || scanning;
  return (
    <>
      <div className="space-y-3">
        {/* One reason for the whole region rather than one per control: the three
          operations are refused together, so the answer to "why can't I?" is
          the same sentence wherever it is asked. */}
        {scanning && (
          <p className="text-sm text-muted-foreground">
            {t('spaceBlockedScanning')}
          </p>
        )}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(spaces.data ?? []).map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <span className="flex-1 break-all">{item.name}</span>
              {item.id === space.id && (
                <Badge size="sm">{t('spaceCurrent')}</Badge>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip text={t('spaceRename')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('spaceRename')}
                    disabled={blocked}
                    onClick={() => setRenaming(item)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </Button>
                </Tooltip>
                <SpaceRemove
                  name={item.name}
                  disabled={blocked}
                  onConfirm={() => commands.removeSpace(item.id)}
                />
              </div>
            </li>
          ))}
        </ul>
        <Button size="sm" disabled={blocked} onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden="true" />
          {t('spaceCreate')}
        </Button>
      </div>
      {/* Outside the spaced column, and outside it deliberately. `space-y` puts a
          bottom margin on every child that is not the last one, so a dialog
          mounted among them stops the button from being last: the button gains a
          margin it did not have, the section grows by it, and everything below
          the section — the heading for this space's folders — moves down by that
          much each time a dialog opens. Radix portals the panel to the document
          root, so it is nobody's child here at all. */}
      {creating && (
        <SpaceDialog
          title={t('spaceCreate')}
          initialName=""
          onSubmit={commands.createSpace}
          onClose={() => setCreating(false)}
        />
      )}
      {renaming && (
        <SpaceDialog
          title={t('spaceRename')}
          initialName={renaming.name}
          onSubmit={(name) => commands.renameSpace(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </>
  );
}
