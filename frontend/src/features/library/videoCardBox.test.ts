import { describe, expect, it } from 'vitest';
import {
  bodyHeight,
  cardBorder,
  pictureAspect,
  rowHeight,
} from './videoCardBox';

const gap = 20;

/**
 * The five layouts ADR 0008 was measured at, in the browser, on the built page
 * with the acceptance fixture in a real grid.
 *
 * A row height here is the height the browser actually gave a row, decomposed
 * into what `rowHeight` is built from: the picture, which is 16:9 of the column
 * minus the card's two borders, the body, which does not scale, and the grid's
 * row gap. The estimate is the rounded form of the same sum, because what it
 * stands in for is read back as `offsetHeight`, an integer.
 *
 * **Nothing but a browser can check this table.** jsdom lays nothing out, so a
 * wrong estimate does not fail anything — it shows up as a list that jumps once
 * the real heights are measured. The numbers below are the check; the way to
 * take them again is in the ADR.
 */
const measured: {
  contentWidth: number;
  columns: number;
  rowHeight: number;
  measured: number;
}[] = [
  { contentWidth: 1058, columns: 4, rowHeight: 226, measured: 225.75 },
  { contentWidth: 1038, columns: 4, rowHeight: 223, measured: 222.94 },
  { contentWidth: 688, columns: 3, rowHeight: 207, measured: 206.91 },
  { contentWidth: 388, columns: 1, rowHeight: 304, measured: 303.66 },
  { contentWidth: 278, columns: 1, rowHeight: 242, measured: 241.78 },
];

describe('the row height of a video card', () => {
  it.each(measured)(
    'reproduces the browser at $contentWidth across $columns columns',
    ({ contentWidth, columns, rowHeight: expected }) => {
      expect(rowHeight(contentWidth, columns, gap)).toBe(expected);
    },
  );

  it('is the picture plus the body plus the gap, rounded', () => {
    // Written out rather than compared against the five rows above, so a change
    // to the shape of the sum is not hidden by the table still happening to
    // agree at those widths.
    const contentWidth = 1058;
    const columns = 4;
    const columnWidth = (contentWidth - (columns - 1) * gap) / columns;
    const picture =
      (columnWidth - cardBorder * 2) *
      (pictureAspect.height / pictureAspect.width);
    expect(rowHeight(contentWidth, columns, gap)).toBe(
      Math.round(picture + bodyHeight + cardBorder * 2 + gap),
    );
  });

  it('is a whole number of pixels', () => {
    // The measurement it stands in for is `offsetHeight`. A fractional estimate
    // leaves a fraction of a pixel a row, and those add up down the grid.
    for (const columns of [1, 2, 3, 4]) {
      for (let width = 200; width <= 1600; width += 7) {
        expect(Number.isInteger(rowHeight(width, columns, gap))).toBe(true);
      }
    }
  });

  it('takes the picture off the column the card has, not off the column', () => {
    // The two borders are off before the ratio is applied, which is the 1.13
    // pixels a row the first version of this estimate was too big by.
    const columnWidth = (1058 - 3 * gap) / 4;
    expect(rowHeight(1058, 4, gap)).toBeLessThan(
      Math.round(
        (columnWidth * pictureAspect.height) / pictureAspect.width +
          bodyHeight +
          cardBorder * 2 +
          gap,
      ),
    );
  });
});
