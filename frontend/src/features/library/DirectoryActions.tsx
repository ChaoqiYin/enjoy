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
 * The settings page draws them larger than the rest of the interface's buttons
 * and never shrinks them to a card's: that page is where folders are managed, the
 * words are what say so, and the size is what keeps them from reading as one more
 * control in a row of them.
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
  const size: ButtonProps['size'] = iconOnly ? 'icon-sm' : 'lg';
  const variant: ButtonProps['variant'] = iconOnly ? 'outline' : 'primary';
  const control = (
    label: string,
    disabled: boolean,
    onClick: () => void,
    icon: ReactNode,
  ) => (
    <Tooltip text={label} disabled={!iconOnly}>
      <Button
        variant={variant}
        size={size}
        className={iconOnly ? undefined : 'gap-3'}
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
    <Icon size={iconOnly ? 14 : 18} aria-hidden="true" />
  );
  return (
    <div
      className={
        iconOnly
          ? 'flex shrink-0 items-center gap-1.5'
          : 'flex flex-wrap items-center gap-3 sm:shrink-0'
      }
    >
      {control(t('add'), false, onAdd, glyph(FolderPlus))}
      {control(t('rescan'), busy, onRescan, glyph(RefreshCw))}
      {onRegenerate &&
        control(t('regenerateAll'), busy, onRegenerate, glyph(Images))}
    </div>
  );
}
