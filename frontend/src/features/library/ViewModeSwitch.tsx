import { LayoutGrid, List, Table } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../shared/Tooltip';
import { ToggleGroup, ToggleGroupItem } from '../../shared/ui/toggle-group';
import type { ViewMode } from './listing';

export type ViewModeSwitchProps = {
  value: ViewMode;
  /** The shape that was picked. Only ever one of the three: see below. */
  onChange: (value: ViewMode) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * How a listing is drawn: a grid of cards, a compact list of rows, or a table.
 *
 * The three shapes are the library's own vocabulary (`VIEW_MODES`, ADR 0017),
 * not the caller's — there is no fourth way to draw a list, and no page offers a
 * different three — so the names and the glyphs live here, and the caller only
 * says which one is in force and hears which one was picked. Which page
 * remembers that choice is the caller's (see `useVideoPageView`).
 *
 * A `single` toggle group reports an empty string when its pressed segment is
 * pressed again (`shared/ui/toggle-group`); for a shape the user is already
 * reading that report would mean "no shape", and a library is always drawn in
 * one, so it is dropped rather than passed on. Each segment carries its name as
 * much for the screen reader as for the test: the drawing's segments are glyphs,
 * so the words are a prompt for the pointer and the keyboard both. The prompt is
 * anchored on the segment itself (`asChild`) rather than wrapped around it — the
 * row of segments stays a row of the group's own children — and the `sr-only`
 * name stays beside it, because the prompt does not replace the name a reader
 * hears, it is the same sentence for the eye.
 */
export function ViewModeSwitch({
  value,
  onChange,
  disabled,
  className,
}: ViewModeSwitchProps) {
  const { t } = useTranslation();
  const segments = [
    { mode: 'grid' as ViewMode, label: t('viewGrid'), Icon: LayoutGrid },
    { mode: 'list' as ViewMode, label: t('viewList'), Icon: List },
    { mode: 'table' as ViewMode, label: t('viewTable'), Icon: Table },
  ];
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next !== '') onChange(next as ViewMode);
      }}
      disabled={disabled}
      aria-label={t('viewMode')}
      data-slot="view-mode-switch"
      className={className}
    >
      {segments.map(({ mode, label, Icon }) => (
        <Tooltip key={mode} text={label} asChild>
          <ToggleGroupItem
            value={mode}
            data-slot="view-mode-switch-item"
            className="size-8 p-0"
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{label}</span>
          </ToggleGroupItem>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
