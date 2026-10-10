import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AddDirectories } from './AddDirectories';
import { pickDirectories } from '../../shared/api';
import english from '../../../../shared/locales/en/common.json';

// The folder picker is a native dialog box; there is nothing in this file that
// can open one, so what it answers is set per case. The registration below
// stands above these imports once the transform hoists it, which is how the
// double is in place by the time the component asks for the module.
vi.mock('../../shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api')>();
  return { ...actual, pickDirectories: vi.fn() };
});

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms per call; Radix asks the page behind the dialog whether it
// sits in the top layer when it hides it. Nothing here is a top-layer element,
// so answering `false` outright is both correct and instant.
const matches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ':modal') return false;
  return matches.call(this, selector);
};

const pick = vi.mocked(pickDirectories);
const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  pick.mockReset();
});

afterEach(cleanup);

function mount() {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const onError = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <AddDirectories
        onClose={onClose}
        onConfirm={onConfirm}
        onError={onError}
      />
    </I18nextProvider>,
  );
  return { onClose, onConfirm, onError };
}

function chooseFolder() {
  return screen.getByRole('button', { name: english.chooseFolder });
}

it('lists a folder chosen twice only once', async () => {
  mount();
  pick
    .mockResolvedValueOnce(['/movies', '/archive'])
    .mockResolvedValueOnce(['/archive', '/series']);
  fireEvent.click(chooseFolder());
  await screen.findByText('/archive');
  fireEvent.click(chooseFolder());
  await screen.findByText('/series');
  // A second pass over the same tree is how a folder gets chosen twice, and a
  // list that says it twice would add it to the profile twice.
  expect(screen.getAllByText('/archive')).toHaveLength(1);
  expect(screen.getByText('/movies')).toBeTruthy();
});

it('reports a picker that would not open to the notice, not beside the list', async () => {
  const { onError } = mount();
  pick.mockRejectedValueOnce(new Error('denied'));
  fireEvent.click(chooseFolder());
  // The failure is about the picker, not about the folders already in the list,
  // so it goes to the notice the caller keeps rather than below them.
  await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  expect(screen.getByText(english.noFolders)).toBeTruthy();
});

it('hands over the folders that were chosen', async () => {
  const { onConfirm } = mount();
  pick.mockResolvedValueOnce(['/movies']);
  fireEvent.click(chooseFolder());
  await screen.findByText('/movies');
  fireEvent.click(screen.getByRole('button', { name: english.confirm }));
  expect(onConfirm).toHaveBeenCalledWith(['/movies']);
});

it('names the remove button after its path, and its tooltip after the act', async () => {
  mount();
  pick.mockResolvedValueOnce(['/movies']);
  fireEvent.click(chooseFolder());
  const row = (await screen.findByText('/movies')).closest('li') as HTMLElement;
  const remove = within(row).getByRole('button');
  // The row already says the path, so the tooltip spends no words on it: the
  // reader who can see the row only needs the act. The name keeps the path
  // because a reader who cannot see the row has nothing else to tell one
  // identical garbage-can button from the next.
  fireEvent.focus(remove);
  const tip = await screen.findByRole('tooltip');
  expect(tip.textContent).toBe(english.remove);
  // The point of the two is that they differ: the tooltip drops the path the
  // row already shows, while the name keeps it, so a reader can still tell the
  // rows apart.
  const label = remove.getAttribute('aria-label') ?? '';
  expect(label).toContain('movies');
  expect(label).not.toBe(english.remove);
});

it('will not confirm with nothing chosen', () => {
  mount();
  // There is nothing to add, so the only honest answer is to keep the button
  // out of reach until there is.
  expect(
    screen
      .getByRole('button', { name: english.confirm })
      .hasAttribute('disabled'),
  ).toBe(true);
});
