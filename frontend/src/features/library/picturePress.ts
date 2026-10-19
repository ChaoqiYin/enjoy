import type { MouseEvent } from 'react';

/**
 * What a press on a video's picture area does: it plays, and it belongs to the
 * picture rather than to the card or the row drawn around it.
 *
 * The rule is one function because there are three places a press on a picture
 * arrives — the card's picture, the row's, and the play button floating over
 * both — and they have to agree. It is not a component: the two picture areas
 * differ in more than a class name (the card floats its marks over the picture,
 * the row keeps its own in the text line beside it, and the row's picture is a
 * fixed 96 pixels), so a component wrapping them would be a `div` forwarding
 * props and slots, which is the shape the guide tells us not to build.
 *
 * A press is claimed before anything else is decided about it, and the claim is
 * unconditional. The second press of a double click is a press on the picture
 * too: letting it through would reach the card's own click and open the details
 * panel behind a gesture the user made asking to play — the very outcome this
 * change exists to remove. Claiming a press this way is what the file name
 * button and `VideoActions` already do for themselves, and it stays in the
 * bubble phase: a capture-phase claim would cut the event off before `VideoMenu`
 * sees it, and that menu closes on a `pointerdown` at the window.
 *
 * Only the first press of a gesture plays, and the count is the platform's
 * rather than ours. `detail` is the browser's own numbering of the presses in a
 * multi-click gesture — 1 on the first press of a double click, 2 on the second
 * — so it already carries the system's double-click interval and slop, which is
 * a thing we would otherwise have to guess (and get wrong on somebody's
 * machine). Two presses further apart than that interval are two presses and
 * both play: this guards a gesture, not a rate. ADR 0042 records the timers
 * this avoids and why they were rejected.
 *
 * `available` is whether playing is possible at all right now: while a media
 * task holds the library every control of the card is disabled, and the picture
 * is one of the places that action can be asked for. The press is claimed while
 * it is unavailable too — nothing about the picture is the card's press, either
 * way. The overlay's own button passes nothing here, because a disabled native
 * button is never delivered a click to begin with.
 */
export function pressOnPicture(
  event: MouseEvent<HTMLElement>,
  play: () => void,
  available = true,
): void {
  event.stopPropagation();
  if (!available || event.detail > 1) return;
  play();
}
