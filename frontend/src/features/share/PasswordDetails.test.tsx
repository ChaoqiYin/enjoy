import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PasswordDetails } from './PasswordDetails';
import english from '../../../../shared/locales/en/common.json';

/**
 * The password block on its own: what the secret looks like on screen, what a
 * press on each of its two buttons hands out, and the one warning it carries.
 *
 * The mask is the only state it holds by itself, and the rest is what it was
 * told — so nothing here mounts the sharing state, and the password's own rules
 * (that it is drawn, that a stored one is the one in force) stay where they
 * live, on the backend side of the seam.
 */
const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});
afterEach(cleanup);

function block(props: Partial<Parameters<typeof PasswordDetails>[0]> = {}) {
  const onCopy = vi.fn();
  const onRegenerate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <PasswordDetails
        password="clipper12345"
        busy={false}
        needsRestart={false}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onCopy, onRegenerate };
}

it('hides the password until it is asked for, and hides it again', () => {
  block();
  // Masked until asked for, and the mask is not the password. It can be read
  // before anything is started, which is the reason the block is drawn at all
  // while the service is stopped.
  const hidden = screen.getByRole('button', { name: english.showPassword });
  expect(hidden.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByText('clipper12345')).toBeNull();

  fireEvent.click(hidden);
  expect(screen.getByText('clipper12345')).toBeTruthy();
  const shown = screen.getByRole('button', { name: english.hidePassword });
  expect(shown.getAttribute('aria-pressed')).toBe('true');

  // And the press is not remembered beyond the visit: the mask comes back.
  fireEvent.click(shown);
  expect(screen.queryByText('clipper12345')).toBeNull();
});

it('copies the password and not the mask', () => {
  const { onCopy } = block();
  // The button is there precisely for the user who has not asked to see the
  // password, so what it copies is the secret rather than what is on screen.
  fireEvent.click(screen.getByRole('button', { name: english.copyPassword }));
  expect(onCopy).toHaveBeenCalledWith('clipper12345');
});

it('will not ask for a new password while a command is in flight', () => {
  const { onRegenerate } = block({ busy: true });
  const button = screen.getByRole('button', {
    name: english.regeneratePassword,
  });
  expect(button.hasAttribute('disabled')).toBe(true);
  fireEvent.click(button);
  expect(onRegenerate).not.toHaveBeenCalled();
});

it('says a running service is behind a password that has been replaced', () => {
  block({ needsRestart: true });
  // Said only while it is true, which is the one moment a user would otherwise
  // be looking at a password that does not work.
  expect(screen.getByText(english.passwordRestartNeeded)).toBeTruthy();
});

it('says nothing when the service in force is behind the password on screen', () => {
  block({ needsRestart: false });
  expect(screen.queryByText(english.passwordRestartNeeded)).toBeNull();
});
