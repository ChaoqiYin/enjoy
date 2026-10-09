import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Pager } from './Pager';
import english from '../../../../shared/locales/en/common.json';

const i18n = createInstance();

beforeEach(async () => {
  await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
});

afterEach(cleanup);

function pager({
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
      <Pager index={index} total={total} onPageChange={onPageChange} />
    </I18nextProvider>
  );
}

it('says how much there is, and which of it is on this page', () => {
  render(pager({ index: 1, total: 60 }));
  // The count is the backend's answer about the whole list, not the number of
  // cards in hand: after a page of records, "how many are there" is a question
  // only the library can answer (ADR 0016).
  expect(screen.getByText('60 items in this library')).toBeTruthy();
  expect(screen.getByText('Showing 25 to 48 results')).toBeTruthy();
});

it('names the page it is being asked for', () => {
  const onPageChange = vi.fn();
  render(pager({ index: 2, total: 100, onPageChange }));
  // From a page in the middle, each control names the page next to this one in
  // the list — a place, not a direction: what the user asks for is a page, and
  // which one is this page's neighbour.
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(onPageChange).toHaveBeenCalledWith(3);
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(onPageChange).toHaveBeenCalledWith(1);
});

it('offers nowhere to go in a list that fits on one page', () => {
  render(pager({ total: 24 }));
  expect(screen.getByText('24 items in this library')).toBeTruthy();
  // There is no other page to offer, and a control that offers nothing is noise
  // — as is a range, which would only repeat the count above it.
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText(/^Showing/)).toBeNull();
});

it('will not turn past either end of the list', () => {
  const { rerender } = render(pager({ total: 60 }));
  expect(
    screen
      .getByRole('button', { name: 'Previous page' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled'),
  ).toBe(false);

  rerender(pager({ index: 2, total: 60 }));
  expect(
    screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Previous page' })
      .hasAttribute('disabled'),
  ).toBe(false);
});

it('says nothing about a range when there is nothing to name', () => {
  render(pager({ total: 0 }));
  // An empty listing has no first or last record to speak of, so it says how
  // many there are and stops there.
  expect(screen.getByText('0 items in this library')).toBeTruthy();
  expect(screen.queryByText(/^Showing/)).toBeNull();
});
