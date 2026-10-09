import { Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Video } from '../../shared/api';
import { Badge } from '../../shared/ui/badge';
import { cn } from '../../shared/ui/cn';

/**
 * The two marks a record can wear, and the two forms they are worn in.
 *
 * They are one component rather than two because they are one decision: the
 * marks are a pair, they say the same kind of thing about a record, and a card
 * that grows a third one has to make room for all three at once.
 *
 * `overlay` floats them over the picture's corners without taking a place in
 * the document flow, which is what keeps a card's rows the same height whether
 * or not its record wears anything. That is the variant for the card and the
 * row, whose picture is the only part they draw twice. `inline` lays them into
 * the flow for a caller that shows them beside other facts — the table's name
 * cell and the details panel — where there is no picture to float over.
 *
 * The two never share a corner: a video can be both the one the user last
 * handed to the player and one of the ones being shared, so the played mark
 * takes the picture's start corner and the shared mark its end.
 *
 * `lastPlayed` is handed in rather than derived: which video was last played is
 * a fact about the session, not about the record, and the record a card is
 * given carries no trace of it.
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
  if (!lastPlayed && !video.shared) return null;
  // What the 共享清单 glyph means, in the two places it has to be said.
  const shared = t('sharedMarker');
  const corner = variant === 'overlay' ? 'absolute top-2 z-10' : 'shrink-0';
  return (
    <>
      {lastPlayed && (
        // A sentence rather than a glyph, unlike the mark beside it: 「上次播放」
        // is a fact about this session that a user meets once, while being on
        // the share list is a state the card wears until it is taken off, and a
        // row of chips with a glyph in each is one the library can no longer be
        // read at a glance.
        //
        // The primary fill is the design document's 「上次播放」 colour: the
        // compiled block paints that mark with the brand red, which is the same
        // value the default badge variant carries in each theme.
        <Badge className={cn(corner, 'start-2')} variant="default">
          {t('lastPlayedMarker')}
        </Badge>
      )}
      {video.shared && (
        // The mark the design document keeps for sharing even in the pages that
        // repaint it: the business token pair `--share` / `--share-border`
        // (`status-shared` / `status-shared-border`), not a colour of our own.
        // The pair is worn whole rather than as one fill: the badge sits on a
        // photograph, its fill is opaque so the picture never reaches under it,
        // and the border is what draws the mark's edge — the dark half of the
        // pair, so the edge holds in both themes over a picture of any
        // brightness. The daisyUI chip this replaced thinned its fill to 80%
        // for the same reason, and that thinning is not what carries it here.
        <Badge
          className={cn(corner, 'end-2')}
          variant="share"
          role="img"
          aria-label={shared}
          title={shared}
        >
          <Share2 size={12} aria-hidden="true" />
        </Badge>
      )}
    </>
  );
}
