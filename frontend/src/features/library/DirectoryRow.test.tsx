import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DirectoryRow } from './DirectoryRow';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; Radix asks every ancestor of the confirmation
// whether it sits in the top layer. Nothing here is a top-layer element, so
// answering `false` outright is both correct and instant.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: english } },
    // What this row interpolates is a path, and a path is mostly separators.
    // i18next escapes `/` by default and React writes text without reading
    // entities, so the escaped form would reach the screen as `&#x2F;movies`.
    // The application turns that off, and a test that left it on would be
    // asserting text no one is ever shown.
    interpolation: { escapeValue: false },
  });
});

afterEach(cleanup);

function row(path: string, onRemove = vi.fn(), disabled = false) {
  render(
    <I18nextProvider i18n={i18n}>
      <DirectoryRow path={path} onRemove={onRemove} disabled={disabled} />
    </I18nextProvider>,
  );
  return onRemove;
}

it('asks in place before the folder leaves the index', () => {
  const onRemove = row('/movies');
  fireEvent.click(screen.getByRole('button', { name: english.removeFolder }));
  expect(
    screen.getByText(english.removeQuestion.replace('{{name}}', '/movies')),
  ).toBeTruthy();
  // Nothing has gone yet: the question is a question.
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: english.confirm }));
  expect(onRemove).toHaveBeenCalledTimes(1);
});

it('shows the folder under the name the platform can read', () => {
  // Windows hands these paths over with a verbatim prefix that is noise on
  // screen, so what the row shows is the readable form of what it was given.
  row('\\\\?\\C:\\Movies');
  expect(screen.getByText('C:\\Movies')).toBeTruthy();
});

it('is out of reach while a media task holds the scan slot', () => {
  row('/movies', vi.fn(), true);
  expect(
    screen
      .getByRole('button', { name: english.removeFolder })
      .hasAttribute('disabled'),
  ).toBe(true);
});
