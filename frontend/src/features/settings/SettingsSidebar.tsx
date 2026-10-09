import { useTranslation } from 'react-i18next';
import { Badge } from '../../shared/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../shared/ui/tabs';

export type SettingsSectionItem = {
  value: string;
  label: string;
  /** What the entry has to report about itself — a count, for instance. Left
   *  out when there is nothing to say rather than drawn empty. */
  badge?: string;
};

/**
 * Which part of the settings page is on screen, as the rail the drawings put
 * down the left: a stack of named entries, the current one marked.
 *
 * It is the `Tabs` primitive's vertical strip, so Radix owns what a stack of
 * choices needs — the single tab stop for the group, the arrow keys that walk
 * it, and the `aria-selected` that says which one is taken. The value is
 * controlled by the caller rather than kept here: the panels it chooses between
 * belong to the page, and a rail that held the answer itself would be a second
 * place the page had to read it from.
 */
export function SettingsSidebar({
  items,
  value,
  onChange,
}: {
  items: SettingsSectionItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Tabs
      orientation="vertical"
      value={value}
      onValueChange={onChange}
      className="w-full"
    >
      <TabsList
        aria-label={t('settings')}
        className="gap-1 rounded-xl border border-border bg-card p-1"
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="w-full justify-between rounded-lg"
          >
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && (
              <Badge variant="secondary" size="sm">
                {item.badge}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
