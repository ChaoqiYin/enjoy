import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Pagination } from './pagination';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: english } },
  });
});

afterEach(cleanup);

function pages({
  page = 2,
  pageSize = 24,
  total = 60,
  onPageChange = vi.fn(),
}: {
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
} = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
      />
    </I18nextProvider>,
  );
}

it('draws the controls and nothing else', () => {
  pages();
  // The heading over a list already says how many records it holds, and the
  // numbered buttons say how far it goes; a "showing 25–48 of 60" line here said
  // the same fact a third time and is gone (ADR 0020). The en dash is what a
  // range is drawn with, so its absence is the whole of what is asserted.
  expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy();
  expect(screen.queryByText(/–/)).toBeNull();
});

it('says which page is the one on screen', () => {
  pages();
  expect(
    screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current'),
  ).toBe('page');
  expect(
    screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current'),
  ).toBeNull();
});

it('asks for the page that was pressed', () => {
  const onPageChange = vi.fn();
  pages({ onPageChange });
  fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
  expect(onPageChange).toHaveBeenCalledWith(3);
});

it('steps forward and back from where it is', () => {
  const onPageChange = vi.fn();
  pages({ onPageChange });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(onPageChange).toHaveBeenCalledWith(3);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(onPageChange).toHaveBeenCalledWith(1);
});

it('will not step off either end', () => {
  const first = pages({ page: 1 });
  expect(
    (screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  first.unmount();
  pages({ page: 3 });
  expect(
    (screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it('keeps quiet while everything fits on one page', () => {
  const { container } = pages({ page: 1, pageSize: 24, total: 5 });
  expect(container.firstChild).toBeNull();
});

it('folds the pages it is not near', () => {
  pages({ page: 5, pageSize: 24, total: 24 * 12 });
  expect(screen.getByRole('button', { name: 'Page 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Page 12' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Page 5' })).toBeTruthy();
  // Pages 8 through 11 are neither drawn nor named.
  expect(screen.queryByRole('button', { name: 'Page 9' })).toBeNull();
});
