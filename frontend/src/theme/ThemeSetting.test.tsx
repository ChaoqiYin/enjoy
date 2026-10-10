import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeSetting } from './ThemeSetting';
import english from '../../../shared/locales/en/common.json';
import errors from '../../../shared/locales/en/errors.json';

const { settings } = vi.hoisted(() => ({
  settings: {
    state: {
      language: 'system' as 'system' | 'en' | 'zh-CN',
      theme: 'dark' as 'light' | 'dark',
    },
    update: vi.fn(),
  },
}));

vi.mock('../settings/SettingsProvider', () => ({
  useSettings: () => settings,
}));

const i18n = createInstance();

beforeEach(async () => {
  settings.state = { language: 'system', theme: 'dark' };
  settings.update.mockReset();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function view() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeSetting />
    </I18nextProvider>
  );
}

/** The two themes are a choice of one, so they are the group's radios rather
 *  than the entries of a menu that has to be opened first. There were three
 *  until following the system was dropped; `dark` is what is in force when the
 *  stored preference names nothing, which is what this fixture stands for. */
it('offers light and dark, with dark in force', () => {
  render(view());
  expect(screen.getByRole('radiogroup', { name: english.theme })).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect(
    screen
      .getByRole('radio', { name: english.darkTheme })
      .getAttribute('aria-checked'),
  ).toBe('true');
});

// jsdom does not implement `ResizeObserver`, and the control measures its track
// with one. The house answer is a stub here rather than a guard in the
// component, which is what `ScrollViewport` does too — see `beforeEach`, which
// has to re-stub it because `afterEach` takes every global back.
class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

/**
 * Picks a theme, the way a pointer does.
 *
 * Not `fireEvent.pointerDown`/`pointerUp`, and not `fireEvent.click`: the
 * control commits on the track's `pointerup`, so a click never reaches it, and
 * jsdom has no `PointerEvent` at all — `@testing-library/dom` falls back to
 * `Event`, whose constructor keeps `bubbles`, `cancelable` and `composed` and
 * silently drops the `pointerId` and `clientX` the component reads. A
 * `MouseEvent` carries the coordinates and takes the id as an own property,
 * which is all React needs to hand it over as a pointer event.
 *
 * A press is also the only path this fixture can take: `useSettings` below is a
 * mock that never reports a new preference, so the component's `value` never
 * moves and the arrow keys — which step from the *current* choice — could only
 * ever reach the segment next to it. A press commits the segment it landed on.
 */
function choose(value: string) {
  const init = { pointerId: 1, button: 0, clientX: 0 };
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    Object.defineProperty(event, 'pointerId', { value: init.pointerId });
    fireEvent(screen.getByRole('radio', { name: value }), event);
  }
}

it('applies the theme once it has been stored', async () => {
  settings.update.mockResolvedValue(undefined);
  render(view());
  choose(english.lightTheme);
  await waitFor(() =>
    expect(settings.update).toHaveBeenCalledWith({ theme: 'light' }),
  );
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('reports a save that failed, and leaves the applied theme alone', async () => {
  settings.update.mockRejectedValue({
    code: 'settings.theme.save_failed',
    params: {},
    errorId: 'err_theme',
  });
  render(view());
  choose(english.lightTheme);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('err_theme');
  // The document must not end up themed one way while the stored preference
  // says another, which is what applying first and saving afterwards did.
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

it('retries the theme the user asked for', async () => {
  settings.update
    .mockRejectedValueOnce({
      code: 'settings.theme.save_failed',
      params: {},
      errorId: 'err_theme',
    })
    .mockResolvedValueOnce(undefined);
  render(view());
  choose(english.lightTheme);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe('light'),
  );
  expect(settings.update).toHaveBeenNthCalledWith(2, { theme: 'light' });
  expect(screen.queryByRole('alert')).toBeNull();
});
