import { useTranslation } from 'react-i18next';
import { Badge } from '../../shared/ui/badge';
import type { Video } from '../../shared/api';

/**
 * The mark a record can wear, in the two forms it is worn in.
 *
 * `overlay` floats it over the picture's corner without taking a place in the
 * document flow, which is what keeps a card's rows the same height whether or
 * not its record wears anything. `inline` lays it into the flow for a caller
 * that shows it beside other facts — the table's name cell and the details
 * panel — where there is no picture to float over.
 *
 * The old build wore a second, shared mark beside this one; sharing is not part
 * of this build, so the pair is one badge here. The position is kept as it was,
 * because the picture's start corner is where the interface has always put it.
 *
 * `lastPlayed` is handed in rather than derived: which video was last played is
 * a fact about the session, not about the record.
 */
export function VideoBadges({
  variant,
  lastPlayed = false,
}: {
  video: Video;
  variant: 'overlay' | 'inline';
  lastPlayed?: boolean;
}) {
  const { t } = useTranslation();
  if (!lastPlayed) return null;
  const corner = variant === 'overlay' ? 'absolute top-2 z-10' : 'shrink-0';
  // A sentence rather than a glyph: 「上次播放」 is a fact about this session
  // that a user meets once, and a row of chips with a glyph in each is one the
  // library can no longer be read at a glance.
  //
  // The primary fill is the design document's 「上次播放」 colour: the compiled
  // block paints that mark with the brand red, which is the same value the
  // default badge variant carries in each theme.
  return (
    <Badge className={variant === 'overlay' ? `${corner} start-2` : corner} variant="default">
      {t('lastPlayedMarker')}
    </Badge>
  );
}
