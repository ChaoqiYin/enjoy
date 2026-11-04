import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui/button';
import { pressOnPicture } from './picturePress';

// Motion only creates the press gesture that can claim the pointer press for an
// element that declares one, so this object stays empty on purpose: being truthy
// is the whole of its job, and the container itself does not move. It is named
// rather than inlined so that it does not read as a leftover to be deleted.
const CLAIM_TAP = {};

/**
 * The play button that rises out of the picture when the pointer or the
 * keyboard reaches the card around it.
 *
 * It is a control of its own rather than a second gesture on the card, and it
 * carries the play affordance for the two views that draw a picture (the card
 * and the compact row) — which is why both hand `VideoActions` nothing to play
 * with: one action, one control, one name. The name is the button's, so a
 * reader that never sees the picture still finds it, and the reveal is done
 * with opacity alone so that the motion preference has nothing to drop.
 *
 * The scrim spans the picture and lets everything through it except the button
 * itself. The button is no longer the only place on the picture where a press
 * means play — the picture area carries that press itself (ADR 0042) — it is
 * the place that says so: the picture's named control, the one a reader that
 * never sees the picture still meets and the one the keyboard reaches. Both
 * presses go through `pressOnPicture`, so both are claimed from the card and
 * both drop the second press of a double click.
 *
 * The press has to be claimed the way `VideoActions` claims it: the button sits
 * inside the card's own press gesture, and without a nested motion element
 * turning `propagate.tap` off, pressing play would dip the whole card. That
 * element must not become a tab stop of its own, hence `tabIndex={-1}`.
 */
export function HoverPlayOverlay({
  onPlay,
  disabled = false,
}: {
  onPlay: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      whileTap={CLAIM_TAP}
      propagate={{ tap: false }}
      tabIndex={-1}
    >
      <Button
        variant="secondary"
        size="icon-lg"
        disabled={disabled}
        aria-label={t('play')}
        className="pointer-events-auto rounded-full opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        // No `available` to pass: a disabled native button never sees a click,
        // which is how this control's own disabling already works.
        onClick={(event) => pressOnPicture(event, onPlay)}
      >
        <Play size={18} aria-hidden="true" />
      </Button>
    </motion.div>
  );
}
