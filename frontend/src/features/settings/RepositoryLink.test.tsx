import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RepositoryLink } from './RepositoryLink';
import english from '../../../../shared/locales/en/common.json';

// The one thing this control asks of the application, stood in for here: what
// it does is hand an address to the system's browser, and there is no browser
// in jsdom to hand it to.
const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }));

vi.mock('../../shared/api', () => ({ openExternal }));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english } },
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function view() {
  return (
    <I18nextProvider i18n={i18n}>
      <RepositoryLink />
    </I18nextProvider>
  );
}

it('opens the repository this project is written in', () => {
  render(view());
  fireEvent.click(screen.getByRole('button', { name: english.openRepository }));
  // The address is the part nothing else holds to: it is a literal in the
  // component, so a typo in it compiles, builds and passes every test that
  // only asks whether *something* was opened.
  expect(openExternal).toHaveBeenCalledWith(
    'https://github.com/ChaoqiYin/enjoy',
  );
});

it('is a mark with a name rather than a label', () => {
  render(view());
  const button = screen.getByRole('button', { name: english.openRepository });
  // What it is drawn as is the shape every other plain-icon control in a card
  // here takes, and the name is the one those carry too.
  expect(button.getAttribute('data-variant')).toBe('outline');
  expect(button.getAttribute('data-size')).toBe('icon-sm');
  // Nothing is written on it: the name is there to be read aloud, not shown.
  expect(button.textContent).toBe('');
});
