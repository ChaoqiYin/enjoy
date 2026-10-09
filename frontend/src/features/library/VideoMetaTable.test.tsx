import { cleanup, render, screen } from '@testing-library/react';
import { Clock, Monitor } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { VideoMetaTable } from './VideoMetaTable';

afterEach(cleanup);

const rows = [
  { icon: <Clock aria-hidden="true" />, label: 'Duration', value: '01:05' },
  {
    icon: <Monitor aria-hidden="true" />,
    label: 'Resolution',
    value: '1920 × 1080',
    badge: 'FHD',
  },
];

function drawn() {
  return Array.from(document.querySelectorAll('[data-slot="video-meta-row"]'));
}

it('pairs every value with the term it describes, in the order it was given', () => {
  render(<VideoMetaTable rows={rows} />);
  expect(drawn().map((row) => row.querySelector('dt')?.textContent)).toEqual([
    'Duration',
    'Resolution',
  ]);
  expect(drawn().map((row) => row.querySelector('dd')?.textContent)).toEqual([
    '01:05',
    '1920 × 1080FHD',
  ]);
});

it('marks a class only on the row whose value has one', () => {
  render(<VideoMetaTable rows={rows} />);
  const row = (text: string) =>
    screen.getByText(text).closest('[data-slot="video-meta-row"]');
  // Which row a badge qualifies is the whole of what it says, so it is drawn
  // inside that row rather than gathered at the table's edge.
  expect(row('01:05')?.querySelector('[data-slot="badge"]')).toBeNull();
  expect(row('FHD')?.querySelector('[data-slot="badge"]')?.textContent).toBe(
    'FHD',
  );
});
