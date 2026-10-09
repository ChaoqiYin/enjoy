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
