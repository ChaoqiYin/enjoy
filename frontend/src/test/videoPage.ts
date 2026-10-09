import { vi } from 'vitest';
import type { Video } from '../shared/api';
import * as doubles from './doubles';
import { video as anyVideo } from './fixtures';

/**
 * 视频库页's stand-ins: the slices the page reads, the mocks its assertions are
 * made against, and the state a test starts from.
 *
 * Two files test this page — the listing it draws, and the drawer a card opens —
 * and both mount it the same way, hand it the same five slices and start from
 * the same record, so those are written once here. What stays in each file is
 * what a reader has to see: the `vi.mock` calls, which reach no further than the
 * file they are written in, and the render helper, which is where what is
 * mounted is readable (开发指南「测试与检查」; `sharePage.tsx` is the same shape
 * for 共享页).
 */

/**
 * The record both files are drawn from, and what every other record in them is a
 * variation of: the fields `fixtures` hands out, with the two the library writes
 * as the file is played.
 */
export const video: Video = anyVideo({ play_count: 3, last_played_at: 10 });

// The two functions the page's own assertions are made against, handed to the
// slice that carries them: a slice's type says a function is a function, which
// is all a caller needs to know and not enough for an assertion, so what the
// page did with them is observable without reaching through the interface.
export const setError = vi.fn();
export const showCopyHint = vi.fn();
export const actionMocks = {
  play: vi.fn(),
  toggleFavorite: vi.fn(),
  toggleShared: vi.fn(),
  reveal: vi.fn(),
  removeVideo: vi.fn(),
  regenerateThumbnail: vi.fn(),
  refreshInfo: vi.fn(),
};

// One double per module the page reads, built from that module's own declared
// type rather than written out here: the page reads five of them — the
// collection, the scan, the in-flight counter, the notices, and what can be
// asked of a video — and a key one of those slices grows is a compile error in
// `doubles`, not a test that quietly goes on passing.
export const collection = doubles.videos();
export const scan = doubles.scan();
export const notices = doubles.notices({ setError, showCopyHint });
export const videoActions = doubles.videoActions(actionMocks);
export const busy = doubles.busy();
export const space = doubles.space({ name: 'Library' });

/**
 * Which page of the list the page is being drawn on.
 *
 * Held here rather than in either test file because it is one half of a pair:
 * the index the view says it is drawing and the page identity the collection
 * slice answers from ({@link collection.pageKey}) move together, and a test that
 * turns one turns both. The record the page starts from is `video` above.
 */
export const listing = { index: 0 };

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms a call and grows with the size of the page; floating-ui asks
// every ancestor of a floating panel that one question, so opening a card's menu
// spends the whole test's time in it. Nothing here is a top-layer element, so
// answering `false` outright is both correct and instant (界面迁移的已知坑 §4).
//
// Put on once, at import, rather than at each reset: this one wraps what was
// there before, and a wrapper wrapped again every test would grow with the file.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

/**
 * The state every test starts from: one record in the collection, the first page
 * of it, nothing being scanned, and nothing being carried out.
 *
 * The space is put back because a test that moves to another space moves this
 * very object — it is what `useSpace` answers with — and the next test would
 * otherwise start somewhere of its own.
 */
export function resetVideoPage() {
  space.id = 1;
  collection.videos.data = { items: [video], total: 1 };
  collection.videos.isPending = false;
  collection.pageKey = 'library page 1';
  listing.index = 0;
  scan.status = undefined;
  busy.busy = false;
  setError.mockReset();
  showCopyHint.mockReset();
  // What each action does with its argument is the library's business and is
  // covered where the library is; here they only have to be observable.
  for (const action of Object.values(actionMocks)) action.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}
