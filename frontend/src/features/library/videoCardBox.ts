/**
 * The box a video card occupies, and the one place its geometry is written
 * down.
 *
 * A card is three things stacked. The picture, which is 16:9 of whatever the
 * column has left once the card's own border is off — the only part that scales
 * with the column. The body, which does not scale at all: a duration on the left,
 * action buttons on the right, and two paddings and a gap around them, all of it
 * set by text metrics rather than by width. And the row gap the grid keeps below
 * the card.
 *
 * Only the first is a formula. The rest are measurements, and every number
 * below is either measured in a browser or derived from one that was. That is
 * why they are here and not in `shared/VirtualGrid`: a grid knows about rows and
 * columns, and nothing about video cards.
 *
 * **This is the estimate, and it has to equal the measurement.** The first
 * paint lays rows out at `rowHeight` and `measureElement` reads the real ones
 * back a moment later. An estimate larger than the truth moves every row below
 * the first up by the difference the moment that reading lands — a list that
 * jumps as soon as it appears. Nothing catches a wrong value here: it is not an
 * error, it is a first paint at the wrong height. ADR 0008 records the 14.6
 * pixels a row this cost before it was measured, the five layouts it was
 * measured at, and how to measure it again.
 *
 * `pictureAspect` and `pictureClass` are the same fact twice, and they have to
 * move together: `aspect-video` is Tailwind's name for 16:9, which is what the
 * picture area's element is given. The class is what makes the browser hold the
 * box; this ratio is what makes the estimate agree with it.
 */
export const pictureAspect = { width: 16, height: 9 };

/**
 * The hook that marks the picture area.
 *
 * It is not decoration and not a test hook: the picture area is the card's
 * **first child**, and daisyUI gives `.card figure:first-child` the clipping and
 * the corner radius. `:first-child` counts an absolutely positioned child —
 * positioning moves the box, not the ordinal — so anything the card renders
 * ahead of the picture takes that rule away with it, and a thumbnail whose own
 * ratio is not 16:9 then sets the picture area's height instead: a played card
 * measuring more than twice its neighbours and dragging its whole row with it
 * (issue #46). What the class does here is give that position a name both the
 * element and the test can read.
 */
export const pictureClass = 'aspect-video';

/** The card's own border, on each side. daisyUI's `card-border` draws it. */
export const cardBorder = 1;

/**
 * The card's body: a duration and a row of buttons with their paddings, in
 * pixels at the `14px` root font size `style.css` sets. Measured, not derived —
 * it is text layout, so it moves when a font size or a padding does, and it must
 * be measured again when it does.
 */
export const bodyHeight = 64.53;

/**
 * Room the scroll viewport keeps on its start edge, so the hover feedback of the
 * first row and first column is not clipped flat at the padding box. It has to
 * cover `4px lift + 1% of the card's height` at the top edge and `1% of the
 * column width + 4px of shadow spill` at the left; the worst layout is a single
 * column, where the column stops at 399 wide and the left edge needs 7.99px.
 * Pixels rather than the rem scale: what has to be covered comes from the card's
 * size, and `html { font-size: 14px }` makes `0.5rem` 7px here — measured too
 * small for that layout. Full table: ADR 0008.
 */
export const hoverRoom = 10;

/**
 * That room, put on the element that clips — and on no other.
 *
 * The room is the clip's to give, so it goes on the scroll container itself:
 * its own `padding` carries the clip edge outwards, and the matching negative
 * `margin` pulls the box back so that nothing on the page moves. Nothing inside
 * can do it instead: a descendant's padding is inside the clip either way, and
 * a descendant's negative margin on the start edge is the one thing an
 * `overflow` box cannot scroll to, so it is cut flat there — which is how the
 * 共享清单's first column came to have its hover shadow sliced off
 * (the grid had the padding and the margin, and the room ended up outside the
 * glass). One writer per edge, and it is the clipper.
 */
export const hoverRoomStyle = {
  paddingTop: hoverRoom,
  paddingInlineStart: hoverRoom,
  marginTop: -hoverRoom,
  marginInlineStart: -hoverRoom,
};

/**
 * The height of one row of `columns` cards inside `contentWidth`, as the
 * virtual grid has to lay it out before anything is measured.
 *
 * `gap` is the grid's, passed rather than imported so this module stays a fact
 * about cards.
 */
export function rowHeight(
  contentWidth: number,
  columns: number,
  gap: number,
): number {
  const columnWidth = (contentWidth - (columns - 1) * gap) / columns;
  const pictureWidth = columnWidth - cardBorder * 2;
  const pictureHeight =
    (pictureWidth * pictureAspect.height) / pictureAspect.width;
  // Rounded, because that is what the measurement it stands in for reports:
  // `measureElement` reads `offsetHeight`, an integer. A fractional estimate
  // leaves a fraction of a pixel per row, and those add up down the grid.
  return Math.round(pictureHeight + bodyHeight + cardBorder * 2 + gap);
}
