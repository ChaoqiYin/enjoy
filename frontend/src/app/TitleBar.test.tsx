// First, deliberately: the mocks below are registered above these imports, so
// the doubles have to be in hand by the time a mocked module is first asked
// for. Everything after this line is imported through the modules they stand
// in for.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './TitleBar';
import english from '../../../shared/locales/en/common.json';
import errors from '../../../shared/locales/en/errors.json';

/**
 * The strip along the top of the window, and the three buttons that used to be
 * the platform's.
 *
 * What the window does with a press is not here and cannot be: the commands are
 * the application's own and the window they act on is a real one. What is here
 * is everything up to that boundary — that the strip is the drag region, that
 * the three buttons are the platform's three in the platform's order, which
 * command each one reaches for, that the middle one is drawn from what the
 * backend says rather than from what this side remembers, and that a press which
 * did nothing is said out loud.
 *
 * The middle button is the reason `listen` is a double here at all: nothing in
 * this component asks the window whether it is maximized, so the only way the
 * picture can change is a message.
 */
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const i18n = createInstance();

/** The backend saying what the window is now, which is the only way it is said. */
let told: ((event: { payload: boolean }) => void) | undefined;

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english, errors } },
  });
  told = undefined;
  vi.mocked(listen).mockImplementation((async (
    event: string,
    handler: (event: { payload: boolean }) => void,
  ) => {
    if (event === 'window-maximized') told = handler;
    // Nothing else subscribes here: the library, the service and the update
    // flow each have their own providers, and none of them is mounted.
    return () => {};
  }) as never);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function bar() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TitleBar />
    </I18nextProvider>,
  );
}

/** The button carrying a mark, found by the name it announces. */
function control(name: string) {
  return screen.getByRole('button', { name });
}

function glyphOf(name: string) {
  return control(name).querySelector('[aria-hidden="true"]')?.className;
}

/** The backend reporting that the window has been maximized, or restored. */
async function theWindowIs(maximized: boolean) {
  await act(async () => {
    told?.({ payload: maximized });
  });
}

it('is the strip the window is dragged by, and says what the window is', () => {
  const { container } = bar();
  const strip = container.firstElementChild;
  // `deep`, not the bare attribute: the picks a user aims at are the ones
  // between things — beside the name, between the buttons — and only the deep
  // form takes the whole subtree. What it leaves out it leaves out by itself,
  // without the buttons having to be named to it.
  expect(strip?.getAttribute('data-tauri-drag-region')).toBe('deep');
  expect(strip?.textContent).toContain('Enjoy');
});

it('offers the three buttons the window used to have, in its order', () => {
  bar();
  expect(
    screen
      .getAllByRole('button')
      .map((each) => each.getAttribute('aria-label')),
  ).toEqual([english.minimizeWindow, english.maximizeWindow, english.close]);
});

it('asks the backend for each of them, by the command that does it', async () => {
  bar();
  fireEvent.click(control(english.minimizeWindow));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('minimize_window'));

  fireEvent.click(control(english.maximizeWindow));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('toggle_maximize_window'),
  );

  // A request, not a close: whether it is held while a 共享服务 runs is the
  // backend's answer, and `close_window` is what carrying out a yes looks like.
  fireEvent.click(control(english.close));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('request_close_window'),
  );
  expect(invoke).not.toHaveBeenCalledWith('close_window');
});

it('draws the middle button from what the backend says the window is', async () => {
  bar();
  expect(glyphOf(english.maximizeWindow)).toContain('window-glyph-maximize');

  await theWindowIs(true);
  expect(glyphOf(english.restoreWindow)).toContain('window-glyph-restore');

  // And back, because a window is restored just as freely as it is maximized,
  // and a button still offering to restore is a button that lies about what it
  // would do next.
  await theWindowIs(false);
  expect(glyphOf(english.maximizeWindow)).toContain('window-glyph-maximize');
});

it('says so when a button did not do what it was pressed for', async () => {
  bar();
  vi.mocked(invoke).mockRejectedValueOnce({
    code: 'app.window.minimize_failed',
    params: {},
    errorId: 'err_test_1',
  });
  fireEvent.click(control(english.minimizeWindow));
  expect(
    await screen.findByText(errors['app.window.minimize_failed']),
  ).toBeTruthy();
});
