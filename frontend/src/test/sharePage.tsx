import { vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';
import * as doubles from './doubles';
import { video } from './fixtures';
import type { ShareStatus } from '../shared/api';

/**
 * The 共享页's stand-ins: what the library and the window say to it, what the
 * backend answers, and the state a test starts from.
 *
 * The mocks themselves stay in each test file — `vi.mock` reaches no further
 * than the file it is written in — and this is what those mocks are pointed at.
 * The provider tree stays in each test file too, deliberately: a shared render
 * helper buys one line and costs the reader the ability to see what is mounted
 * (see 开发指南「测试与检查」). What is shared here is the data, which is the
 * same for both files and is what a second copy would let drift.
 *
 * The chrome the page sits in asks the library three things — whether a pass is
 * running, what the library has to say, and what videos there are. None is what
 * the share page's tests are about, and all three come from the slices' own
 * declarations.
 */
export const scan = doubles.scan();
export const notices = doubles.notices();
export const library = doubles.videos();
/** Whether the library is carrying out a command right now. */
export const busy = doubles.busy();
// The 共享清单 is drawn with the library's own cards, so the menu behind them is
// the library's own actions: a page that draws a card owes it the seven things a
// card can ask for.
export const videoActions = doubles.videoActions();

/**
 * The window, as the provider asks it to hold a close while the question is
 * put, and to go through with one afterwards.
 *
 * The handler is kept so that a test can be the window: there is no other way
 * to ask for a close from here, and being asked is the whole of what the
 * provider has to get right. `subscribed` is the other half of that, and the
 * one that is not about the question at all: a window with a close-requested
 * listener never closes by itself, so whether one is outstanding is what
 * decides whether the close button still works — which is why it is torn down
 * with the service and why a test watches it.
 *
 * `destroy` is what the provider asks for once the answer is yes; there is no
 * `close` here, because a window that has subscribed cannot be closed by one
 * (see `shared/api.ts`), and a mock that offered it would let a test pass on a
 * call that could never work.
 */
export const windowMock = {
  handler: undefined as
    ((event: { preventDefault: () => void }) => void) | undefined,
  subscribed: false,
  destroy: vi.fn(async () => {}),
  onCloseRequested(handler: (event: { preventDefault: () => void }) => void) {
    windowMock.handler = handler;
    windowMock.subscribed = true;
    return Promise.resolve(() => {
      windowMock.subscribed = false;
      if (windowMock.handler === handler) windowMock.handler = undefined;
    });
  },
};

/**
 * The backend as a test holds it: the mock of the one address the interface
 * reaches it by.
 *
 * Named as a type and not imported as a value — a type is erased before
 * anything runs, and `shared/api.ts` is to stay the single way in. That is why
 * the mock is passed in rather than reached for here.
 */
type Backend = typeof invoke;

/**
 * What the backend would answer, one command at a time. The port is the
 * backend's to choose, so a test that named it in the interface would be
 * testing the wrong side of the seam: this hands back one the interface never
 * asked for.
 */
export function backend(
  backend: Backend,
  answers: Partial<Record<string, ShareStatus>>,
) {
  vi.mocked(backend).mockImplementation((async (command: string) => {
    const answer = answers[command];
    if (!answer) throw { code: 'app.unexpected', errorId: 'test' };
    return answer;
  }) as never);
}

/**
 * The status the backend would answer with, with everything the test is not
 * about left as it is when nothing has been started.
 *
 * The credentials are the backend's, drawn by it and never by the interface, so
 * a test names what it wants to see on screen rather than a value the interface
 * would have had to invent.
 */
export function status(overrides: Partial<ShareStatus> = {}): ShareStatus {
  return {
    port: null,
    missingFiles: 0,
    username: 'enjoy',
    password: '7315',
    needsRestart: false,
    listChanged: false,
    devices: [],
    addresses: [],
    ...overrides,
  };
}

/** The clipboard the page copies a password to. */
export function setClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

/**
 * The state every test starts from: the backend has not been asked anything,
 * the window has not been asked to close, and the 共享清单 has something on it —
 * so that the tests that are not about an empty one are not all also testing
 * the button that will not start over nothing.
 */
export function resetSharePage(backend: Backend) {
  vi.mocked(backend).mockReset();
  library.videos.data = [video({ shared: true })];
  windowMock.handler = undefined;
  windowMock.subscribed = false;
  windowMock.destroy.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // jsdom has the element but not the method that shows it, so a modal is
  // opened by setting what the browser would have set.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
}
