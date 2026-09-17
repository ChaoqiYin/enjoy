import { expect, it } from 'vitest';
import { formatBytes, progressRatio } from './updateFormat';

it('formats a byte count with a unit that fits it', () => {
  expect(formatBytes(0, 'en')).toBe('0 B');
  expect(formatBytes(1023, 'en')).toBe('1,023 B');
  expect(formatBytes(1024, 'en')).toBe('1 KB');
  expect(formatBytes(1_572_864, 'en')).toBe('1.5 MB');
});

it('reports no ratio when there is no total to divide by', () => {
  // The server may answer without a content length; a reported total of zero
  // would otherwise divide by zero.
  expect(progressRatio(100, null)).toBeNull();
  expect(progressRatio(100, 0)).toBeNull();
});

it('reports the share done, clamped at one', () => {
  expect(progressRatio(50, 200)).toBe(0.25);
  expect(progressRatio(200, 100)).toBe(1);
});
