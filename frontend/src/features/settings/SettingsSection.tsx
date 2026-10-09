import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '../../shared/ui/card';

/**
 * One named block of the settings page: what it is about, and the controls
 * that are about it.
 *
 * The block is a `Card`, so the page reads as a stack of them the way the
 * drawings lay it out, and the icon and title are a fixed part of the shape
 * rather than something each block redraws. The body is whatever the caller
 * puts in it, which is what keeps a block from knowing what a language picker
 * or a list of folders is.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-2 border-b border-border pb-4">
        {/* An `h2` rather than the card's own title: the page is a stack of
            these, so the rail names the page and each block is a section under
            it, which is what a reader walking the outline is given. */}
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon size={18} aria-hidden="true" />
          {title}
        </h2>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
