import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ListWarnings } from './ListWarnings';
import english from '../../../../shared/locales/en/common.json';

/**
 * The two things said about a 共享清单 a service is offering, and the one rule
 * that holds both of them: said only while something is serving.
 *
 * The facts come from the backend, so what is left here is when each is worth
 * saying — which is the whole of this block, and the reason it is one block.
 */
const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});
afterEach(cleanup);

function block(props: Partial<Parameters<typeof ListWarnings>[0]> = {}) {
  render(
    <I18nextProvider i18n={i18n}>
      <ListWarnings
        running={false}
        missingFiles={0}
        listChanged={false}
        {...props}
      />
    </I18nextProvider>,
  );
}

it('says how many videos on the list a client will not be offered', () => {
  // The count and not the names: what the user needs to know is that the
  // television will show fewer than they picked.
  block({ running: true, missingFiles: 2 });
  expect(
    screen.getByText(
      english.shareMissingFiles_other.replace('{{countText}}', '2'),
    ),
  ).toBeTruthy();
});

it('says a running service is offering the list it was started with, after a change', () => {
  // The service keeps what it started with, so a list that has been added to
  // since is not what a client is being offered — and a user who just added a
  // video would otherwise conclude the change did not work.
  block({ running: true, listChanged: true });
  expect(screen.getByText(english.shareListChanged)).toBeTruthy();
});

it('says nothing about the list while it is the one being offered', () => {
  // Same list as the one the service read, and every file still on disk: there
  // is nothing to warn about, and a warning here would be one no one could act
  // on.
  block({ running: true });
  expect(screen.queryByText(english.shareListChanged)).toBeNull();
  expect(
    screen.queryByText(
      english.shareMissingFiles_other.replace('{{countText}}', '2'),
    ),
  ).toBeNull();
});

it('says nothing at all while nothing is serving', () => {
  // Nothing is running, so there is no list being offered: a list that differs
  // from one that does not exist is not a fact about anything, and the same goes
  // for files a client will not be offered by a service that is not there.
  block({ running: false, missingFiles: 3, listChanged: true });
  expect(screen.queryByText(english.shareListChanged)).toBeNull();
  expect(
    screen.queryByText(
      english.shareMissingFiles_other.replace('{{countText}}', '3'),
    ),
  ).toBeNull();
});
