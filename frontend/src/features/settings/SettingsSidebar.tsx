import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../shared/ui/cn';
import {
  Sidebar,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '../../shared/ui/sidebar';

/** One entry that chooses a panel. */
export type SettingsLeaf = {
  value: string;
  label: string;
  icon?: ReactNode;
  /** What the entry has to report about itself — how many folders, say. The
   *  rail draws it when it is given a number, and the caller decides that none
   *  means nothing: the rail cannot tell an absence from a zero. */
  badge?: number;
};

/** One entry that opens to show others. Its rows are leaves and not branches:
 *  two levels are what this page has, and saying so in the type is what keeps a
 *  third from turning up without the rail learning to draw it. */
export type SettingsBranch = {
  value: string;
  label: string;
  icon?: ReactNode;
  children: SettingsLeaf[];
};

export type SettingsEntry = SettingsLeaf | SettingsBranch;

/**
 * Which part of the settings page is on screen, as the rail the drawings put
 * down the left: a column of rows where one opens to show what is under it, and
 * the current one is filled in and carrying what it has to report.
 *
 * It is a shadcn `Sidebar` (see `shared/ui/sidebar.tsx` for what was left out of
 * it and why). What belongs to this rail rather than to that primitive is the
 * three things that are about this rail: which rows there are, which branch is
 * open, and the name the whole list answers to.
 *
 * The panel on screen stays the caller's (`value` / `onSelect`), as it did when
 * this was the `Tabs` primitive's strip: the panels belong to the page, and a
 * rail that held the answer itself would be a second place the page had to read
 * it from. Which branch is open is the rail's own, because the page has no
 * opinion about it — it is how the rail is drawn, not what the page shows.
 *
 * The rows under a branch are mounted only while it is open, and they arrive
 * with no animation. Upstream's sidebar has none either: the motion in shadcn's
 * own examples comes from wrapping the pair in Radix's `Collapsible`, which
 * would mean keeping a second component's state and a motion library in this
 * file. The fold the vendored menu had before this was machinery of its own, and
 * removing that machinery is what this change is. The trade is visible and worth
 * naming: three rows appear and disappear in one frame where they used to grow.
 *
 * The keyboard is Tab and nothing else (ADR 0023). Every row is an ordinary
 * button, so the rail is walked one stop at a time — no arrow keys, no single
 * tab stop. That is what the primitive upstream draws gives, and what this
 * repository chose to keep rather than build on top of.
 */
export function SettingsSidebar({
  items,
  value,
  onSelect,
}: {
  items: SettingsEntry[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const { t } = useTranslation();
  // Opens on the branch that owns the panel already on screen; otherwise the
  // current choice arrives hidden and the rail reads as if nothing were chosen.
  // Lazy, so it is read once: from then on which branches are open is the
  // reader's, and a later `value` is a panel change rather than an instruction
  // to open anything.
  const [open, setOpen] = useState<Set<string>>(() => {
    const start = new Set<string>();
    for (const item of items)
      if ('children' in item && item.children.some((c) => c.value === value))
        start.add(item.value);
    return start;
  });
  const toggle = (entry: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(entry)) next.delete(entry);
      else next.add(entry);
      return next;
    });
  return (
    <Sidebar>
      {/* Named here, on the one list, because a rail of choices with no name is
          one more anonymous list to a reader walking the page. It is a list and
          not a landmark: the page's only `navigation` is the header's, and
          `app/routes.test.tsx` holds it to being the only one. */}
      <SidebarMenu aria-label={t('settings')}>
        {items.map((item) =>
          'children' in item ? (
            <SidebarMenuItem key={item.value}>
              <SidebarMenuButton
                aria-expanded={open.has(item.value)}
                onClick={() => toggle(item.value)}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'ml-auto transition-transform',
                    open.has(item.value) && 'rotate-90',
                  )}
                />
              </SidebarMenuButton>
              {open.has(item.value) && (
                <SidebarMenuSub>
                  {item.children.map((child) => (
                    <SidebarMenuSubItem key={child.value}>
                      <SidebarMenuSubButton
                        isActive={child.value === value}
                        onClick={() => onSelect(child.value)}
                      >
                        {child.icon}
                        <span className="min-w-0 flex-1 truncate">
                          {child.label}
                        </span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem key={item.value}>
              <SidebarMenuButton
                isActive={item.value === value}
                onClick={() => onSelect(item.value)}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </SidebarMenuButton>
              {item.badge !== undefined && (
                <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          ),
        )}
      </SidebarMenu>
    </Sidebar>
  );
}
