import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import english from '../../../shared/locales/en/common.json';
import errors from '../../../shared/locales/en/errors.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english, errors } },
  });
  // React writes every render error it catches to the console, and throwing is
  // what these tests are made of. Muting it keeps an expected throw from
  // reading as a failure in the run's output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Explodes(): never {
  throw new Error('render failed');
}

function view(children: ReactNode) {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </I18nextProvider>
  );
}

it('reports a failed render instead of leaving the page empty', () => {
  // Without a boundary React unmounts the tree the throw happened in, which for
  // a root-level boundary is the whole app: an empty window with nothing to
  // read and nothing to press.
  render(view(<Explodes />));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText(errors['app.render_failed'])).toBeTruthy();
});

it('gives the screen back when the notice is dismissed', () => {
  // Dismissing the report and asking for the screen again are the same request,
  // because the screen is what was lost.
  let broken = true;
  function SometimesBroken() {
    if (broken) throw new Error('render failed');
    return <p>recovered</p>;
  }
  render(view(<SometimesBroken />));
  broken = false;
  fireEvent.click(screen.getByRole('button', { name: english.close }));
  expect(screen.getByText('recovered')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
