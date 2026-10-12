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
 *
 * `action` is the one thing this shape lets a caller put *beside* the title
 * rather than under it: the heading row is where a control belonging to the
 * block as a whole goes, and it is the only row of one that draws nothing of
 * its own. Left out, the row is what it always was — the mark and the name.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-2 border-b border-border pb-4">
        {/* An `h2` rather than the card's own title: the page is a stack of
            these, so each block is a section of it, which is what a reader
            walking the outline is given. The page draws no heading of its own —
            the header's navigation names it — so these are as high as the
            outline goes here. The action sits outside the heading rather than
            in it: a button inside an `h2` would be read out as part of the
            heading, which is a name the caller did not give. */}
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon size={18} aria-hidden="true" />
            {title}
          </h2>
          {action && <span className="ml-auto">{action}</span>}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
