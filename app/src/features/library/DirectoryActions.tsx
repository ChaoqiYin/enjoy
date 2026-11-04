import { FolderPlus, Images, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui/button';
import type { ButtonProps } from '../../shared/ui/button';
import { Tooltip } from '../../shared/Tooltip';

type DirectoryActionsProps = {
  busy: boolean;
  onAdd: () => void;
  onRescan: () => void;
  onRegenerate?: () => void;
  /** Which of the two forms these are drawn in. The settings page, where folder
   *  management lives, keeps them as the larger labelled buttons; the library's
   *  toolbar asks for the icon-only group instead. */
  iconOnly?: boolean;
};

/**
 * The folder-wide actions, in whichever of their two forms the caller asks for.
 *
 * Both forms draw on the same scale as the rest of the interface: the settings
 * page keeps the words and takes `default`, the toolbar keeps the glyph and
 * takes `icon-sm`. The labelled form used to be `lg` so the folder commands
 * would not read as one more control in a row; that extra step is gone, and
 * the words are what mark the block now.
 *
 * The library's toolbar is a row of controls already, and there the same buttons
 * are read as what the page does rather than as a fifth control that narrows the
 * list — so there they take the shape every other icon-only action in the
 * interface takes (`outline`, `icon-sm`, a 14-pixel glyph, `gap-1.5`), and the
 * words move into a tooltip, which is the only place left for them to be said.
 * `aria-label` carries the same words either way, because the name a control
 * answers to is not a thing the visual form gets to decide.
 */
export function DirectoryActions({
  busy,
  onAdd,
  onRescan,
  onRegenerate,
  iconOnly,
}: DirectoryActionsProps) {
  const { t } = useTranslation();
  const size: ButtonProps['size'] = iconOnly ? 'icon-sm' : 'default';
  const variant: ButtonProps['variant'] = iconOnly ? 'outline' : 'primary';
  const control = (
    label: string,
    disabled: boolean,
    onClick: () => void,
    icon: ReactNode,
    testid: string,
  ) => (
    <Tooltip text={label} disabled={!iconOnly}>
      <Button
        data-testid={testid}
        variant={variant}
        size={size}
        // The icon-only form is the toolbar's, and the toolbar is a bare row on
        // the page canvas: those buttons take `--field` like the controls
        // around them. The labelled form is the settings page's, on a card,
        // and takes `primary`.
        className={iconOnly ? 'bg-field' : undefined}
        disabled={disabled}
        aria-label={iconOnly ? label : undefined}
        onClick={onClick}
      >
        {icon}
        {!iconOnly && label}
      </Button>
    </Tooltip>
  );
  const glyph = (Icon: typeof FolderPlus) => (
    <Icon size={14} aria-hidden="true" />
  );
  return (
    <div
      className={
        iconOnly
          ? 'flex shrink-0 items-center gap-1.5'
          : 'flex flex-wrap items-center gap-3 sm:shrink-0'
      }
    >
      {control(t('add'), false, onAdd, glyph(FolderPlus), 'add-folder')}
      {control(t('rescan'), busy, onRescan, glyph(RefreshCw), 'rescan-folders')}
      {onRegenerate &&
        control(
          t('regenerateAll'),
          busy,
          onRegenerate,
          glyph(Images),
          'regenerate-thumbnails',
        )}
    </div>
  );
}
