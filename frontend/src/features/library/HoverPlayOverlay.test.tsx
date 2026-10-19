import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HoverPlayOverlay } from './HoverPlayOverlay';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function overlay(onPlay = vi.fn(), onCard = vi.fn(), disabled = false) {
  render(
    <I18nextProvider i18n={i18n}>
      <div onClick={onCard}>
        <HoverPlayOverlay onPlay={onPlay} disabled={disabled} />
      </div>
    </I18nextProvider>,
  );
  return { onPlay, onCard };
}

it('offers the play the card block would otherwise swallow', () => {
  const { onPlay, onCard } = overlay();
  // Named as the control it is, so a reader that sees no picture still meets it.
  fireEvent.click(screen.getByRole('button', { name: english.play }));
  expect(onPlay).toHaveBeenCalledOnce();
  // `onCard` stands for the picture area this overlay covers, which takes the
  // same press and plays. Pressing the button must not also play through the
  // picture: one action, one call.
  expect(onCard).not.toHaveBeenCalled();
});

it('plays once for one press gesture on the button', () => {
  const { onPlay, onCard } = overlay();
  // The button runs the picture's own rule, and that rule counts the presses of
  // a gesture rather than the presses of a control: double-clicking this button
  // is one play, as double-clicking the picture is (ADR 0042).
  const button = screen.getByRole('button', { name: english.play });
  fireEvent.click(button, { detail: 1 });
  fireEvent.click(button, { detail: 2 });
  expect(onPlay).toHaveBeenCalledOnce();
  expect(onCard).not.toHaveBeenCalled();
});

it('stays out of the way while a media task holds the library', () => {
  const { onPlay } = overlay(vi.fn(), vi.fn(), true);
  const button = screen.getByRole('button', {
    name: english.play,
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(onPlay).not.toHaveBeenCalled();
});
