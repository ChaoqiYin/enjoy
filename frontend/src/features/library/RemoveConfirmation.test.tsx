import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { RemoveConfirmation } from './RemoveConfirmation';
import { video } from '../../test/fixtures';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
  // jsdom has the element but not the method that shows it, so a modal is
  // opened by setting what the browser would have set.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});

afterEach(cleanup);

function confirmation(shared: boolean) {
  return render(
    <I18nextProvider i18n={i18n}>
      <RemoveConfirmation
        video={video({ shared })}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    </I18nextProvider>,
  );
}

it('says a video on the share list will leave it', () => {
  confirmation(true);
  // The record carries the 共享清单 mark, so removing the index takes the video
  // off that list too — which is the answer to "why did the television stop
  // seeing it", asked a day later.
  expect(screen.getByText(english.removeShared)).toBeTruthy();
  // And the existing promise is still made: the file itself is untouched.
  expect(screen.getByText(english.keepFile)).toBeTruthy();
});

it('says nothing about sharing for a video that is not on it', () => {
  confirmation(false);
  // A warning on every removal is one the user learns to read past.
  expect(screen.queryByText(english.removeShared)).toBeNull();
  expect(screen.getByText(english.keepFile)).toBeTruthy();
});
