import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmTooltip } from '../../shared/ConfirmTooltip';
import { Tooltip } from '../../shared/Tooltip';
import { useLibraryContext } from '../library/LibraryProvider';
import { isScanRunning } from '../library/scanFeedback';
import { useSpaces } from './SpaceProvider';
import { SpaceDialog } from './SpaceDialog';
import type { Space } from '../../shared/api';

/**
 * The spaces the application holds: the list, which one the interface is
 * showing, and the three things that can be done to the set of them.
 *
 * A refused name is reported by the dialog, beside the field it is about. A
 * refused deletion is not: nothing about it is local to the row, so it goes out
 * through the library's notice, where every other action that could not be
 * carried out is reported.
 */
export function SpaceSetting() {
  const { t } = useTranslation();
  const library = useLibraryContext();
  const { space, spaces } = useSpaces();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Space | null>(null);
  // The same slot the switch asks about: a pass, a paused pass, or one file's
  // information being refreshed. The backend refuses these operations for the
  // reason above the buttons; this is that rule said in advance.
  const scanning = isScanRunning(library.scan.data);
  const blocked = library.busy || scanning;
  return (
    <div className="space-y-4">
      {/* One reason for the whole region rather than one per control: the three
          operations are refused together, so the answer to "why can't I?" is
          the same sentence wherever it is asked. */}
      {scanning && (
        <p className="text-sm opacity-65">{t('spaceBlockedScanning')}</p>
      )}
      {(spaces.data ?? []).map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-4 bg-base-200 p-4 rounded-box"
        >
          <span className="break-all flex-1">{item.name}</span>
          {item.id === space.id && (
            <span className="badge badge-primary">{t('spaceCurrent')}</span>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip text={t('spaceRename')}>
              <button
                className="btn btn-outline btn-xs btn-square btn-secondary"
                aria-label={t('spaceRename')}
                disabled={blocked}
                onClick={() => setRenaming(item)}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            </Tooltip>
            <ConfirmTooltip
              message={t('spaceRemoveQuestion', { name: item.name })}
              confirmLabel={t('confirm')}
              cancelLabel={t('cancel')}
              disabled={blocked}
              onConfirm={() => void library.removeSpace(item.id)}
            >
              <button
                className="btn btn-outline btn-xs btn-square btn-error"
                aria-label={t('spaceRemove')}
                disabled={blocked}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </ConfirmTooltip>
          </div>
        </div>
      ))}
      <button
        className="btn btn-soft btn-md btn-primary"
        disabled={blocked}
        onClick={() => setCreating(true)}
      >
        <Plus size={18} aria-hidden="true" />
        {t('spaceCreate')}
      </button>
      {creating && (
        <SpaceDialog
          title={t('spaceCreate')}
          initialName=""
          onSubmit={library.createSpace}
          onClose={() => setCreating(false)}
        />
      )}
      {renaming && (
        <SpaceDialog
          title={t('spaceRename')}
          initialName={renaming.name}
          onSubmit={(name) => library.renameSpace(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
