/**
 * What a video card leaves for the code around it: the class its picture area
 * wears, and the room the viewport that clips the cards keeps for the first
 * row's and first column's hover feedback.
 *
 * The rest of a card's box used to be written down here too — its border, its
 * body, the picture's ratio, and the row-height estimate built from all of
 * them — because a virtual grid had to lay its rows out before anything was
 * measured, and the estimate had to equal the measurement or the list jumped as
 * soon as the reading landed (ADR 0008). That grid is gone (ADR 0017): a page is
 * one page of records (ADR 0016) and the browser lays them out, so an estimate
 * has nothing left to stand in for. What survives here is what the browser
 * cannot work out on its own.
 */

/**
 * The picture area's ratio, as the class its element wears.
 *
 * `aspect-video` is Tailwind's name for 16:9, and the class is what holds the
 * box open — before the image has loaded, and whatever ratio the file itself
 * has. A picture area left to take its height from the file measured more than
 * twice its neighbours for a non-16:9 video and dragged its whole row with it
 * (issue #46): the ratio is the card's, not the file's.
 */
export const pictureClass = 'aspect-video';

/**
 * Room the scroll viewport keeps on its start edge, so the border glow of the
 * first row and first column is not clipped flat at the padding box.
 *
 * It is `glowRadius`, and that is the whole of it: the card's glow is thrown
 * 10px past it on every side (`border-glow.tsx`), and the clip around the cards
 * is the only thing that can cut it, so the room is that reach. It used to be
 * argued from the hover lift — `4px lift + 1% of the card's height` at the top,
 * `1% of the column width + 4px of shadow spill` at the left — and both of
 * those are gone: the card does not lift (ADR 0021) and the shadow it spilled
 * was replaced by the glow.
 *
 * The end edge needs none of this: `.scroll-viewport` keeps a flat 20px there,
 * twice this reach, and flat is the point — a gap that shrank as the scrollbar
 * widened was how the last column's glow came to be scrollable overflow. The
 * bottom edge has nothing, and is
 * the one place a glow still ends in a straight line — the last row of a list
 * scrolled to its end — because room below it would come out of the page's own
 * layout rather than out of the clip.
 *
 * Pixels rather than the rem scale: what has to be covered comes from the
 * glow's radius, which is written in pixels. Full table: ADR 0008.
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
