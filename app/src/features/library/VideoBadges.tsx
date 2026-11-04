import { useTranslation } from 'react-i18next';
import { Badge } from '../../shared/ui/badge';
import type { Video } from '../../shared/api';

/**
 * The marks a record can wear, in the two forms they are worn in.
 *
 * `overlay` floats them over the picture's corner without taking a place in the
 * document flow, which is what keeps a card's rows the same height whether or
 * not its record wears anything. `inline` lays them into the flow for a caller
 * that shows them beside other facts — the table's name cell and the details
 * panel — where there is no picture to float over.
 *
 * Two marks share the place: `shared`, a fact about the record that is true
 * until it is turned off, and `lastPlayed`, a fact about this session that is
 * handed in rather than derived. Neither is drawn when it does not hold, and
 * the pair sits together so a record with both still leaves the picture's
 * corner legible.
 */
export function VideoBadges({
  video,
  variant,
  lastPlayed = false,
}: {
  video: Video;
  variant: 'overlay' | 'inline';
  lastPlayed?: boolean;
}) {
  const { t } = useTranslation();
  if (!video.shared && !lastPlayed) return null;
  // The shared mark borrows the drawings' business pair rather than a
  // primitive's colour: it is opaque so the photograph never reaches under it,
  // and its edge is what separates it from what it covers.
  //
  // The last-played mark is a sentence rather than a glyph: 「上次播放」 is a
  // fact a user meets once, and a row of chips with a glyph in each is one the
  // library can no longer be read at a glance. It wears the primary fill, the
  // design document's 「上次播放」 colour, which the default badge variant
  // carries in each theme.
  const marks = (
    <>
      {video.shared && (
        <Badge data-testid="shared-badge" variant="share">
          {t('sharedMarker')}
        </Badge>
      )}
      {lastPlayed && (
        <Badge variant="default">{t('lastPlayedMarker')}</Badge>
      )}
    </>
  );
  if (variant === 'overlay') {
    return (
      <div className="absolute top-2 start-2 z-10 flex items-center gap-1">
        {marks}
      </div>
    );
  }
  return <span className="inline-flex shrink-0 items-center gap-1">{marks}</span>;
}
