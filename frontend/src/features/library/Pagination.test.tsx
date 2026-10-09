import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function footer({
  index = 0,
  total,
  onPageChange = vi.fn(),
}: {
  index?: number;
  total: number;
  onPageChange?: (index: number) => void;
}) {
  return (
    <I18nextProvider i18n={i18n}>
      <Pagination index={index} total={total} onPageChange={onPageChange} />
    </I18nextProvider>
  );
}

it('says which slice of the list is on screen', () => {
  render(footer({ index: 1, total: 60 }));
  // The range is named over the whole list, which only the backend knows the
  // size of (ADR 0016): the second page of 24 is records 25 to 48.
  expect(screen.getByText('Showing 25–48 of 60')).toBeTruthy();
});

it('asks for the page that was picked', () => {
  const onPageChange = vi.fn();
  render(footer({ index: 1, total: 60, onPageChange }));
  fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
  // The library counts pages from zero (the index the backend is asked for), so
  // that spelling is confined here and the footer speaks in the page numbers the
  // user reads (see `useVideoPageView`).
  expect(onPageChange).toHaveBeenCalledWith(2);
});

it('turns one page at a time', () => {
  const onPageChange = vi.fn();
  render(footer({ index: 1, total: 60, onPageChange }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(onPageChange).toHaveBeenCalledWith(2);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(onPageChange).toHaveBeenCalledWith(0);
});

it('marks the page being read', () => {
  render(footer({ index: 2, total: 120 }));
  expect(
    screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current'),
  ).toBe('page');
});

it('offers no pages in a list that fits on one', () => {
  render(footer({ total: 24 }));
  // Nothing else to read: a footer whose only page is this one is furniture, and
  // a range would repeat what the toolbar already says about the whole list.
  expect(screen.queryByText(/^Showing/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
});

it('offers no pages beyond the end of the list', () => {
  // An index past the end is clamped before it reaches this footer (`useLibrary`,
  // `clampPage`), which leaves the one index that is past the end of every
  // possible list: the first page of one holding nothing. A footer there would
  // name a range that runs backwards, so it says nothing at all.
  render(footer({ index: 0, total: 0 }));
  expect(screen.queryByText(/^Showing/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
});
