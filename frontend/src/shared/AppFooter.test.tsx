import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AppFooter } from './AppFooter';
import english from '../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function footer(props: {
  port: number | null;
  hardwareAcceleration: boolean | null;
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AppFooter {...props} />
    </I18nextProvider>,
  );
}

it('names what this is and where the service is listening', () => {
  footer({ port: 4918, hardwareAcceleration: true });
  expect(screen.getByText(english.footerProduct)).toBeTruthy();
  expect(screen.getByText('Port: 4918')).toBeTruthy();
  expect(screen.getByText(english.footerAccelerationOn)).toBeTruthy();
});

it('reports the encoding state the platform gave it, either way', () => {
  footer({ port: null, hardwareAcceleration: false });
  expect(screen.getByText(english.footerAccelerationOff)).toBeTruthy();

  cleanup();
  footer({ port: null, hardwareAcceleration: true });
  expect(screen.getByText(english.footerAccelerationOn)).toBeTruthy();
});

it('claims nothing about the encoding while nothing has said', () => {
  footer({ port: null, hardwareAcceleration: null });
  // The interface has no measurement of its own to offer here, and "on" beside
  // a fact nobody measured is a claim it cannot support — so it says so.
  expect(screen.getByText(english.footerAccelerationUnknown)).toBeTruthy();
  expect(screen.queryByText(english.footerAccelerationOn)).toBeNull();
});
