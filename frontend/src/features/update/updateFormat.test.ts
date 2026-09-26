import { expect, it } from 'vitest';
import { formatBytes, formatReleaseDate, progressRatio } from './updateFormat';

it('formats a byte count with a unit that fits it', () => {
  expect(formatBytes(0, 'en')).toBe('0 B');
  expect(formatBytes(1023, 'en')).toBe('1,023 B');
  expect(formatBytes(1024, 'en')).toBe('1 KB');
  expect(formatBytes(1_572_864, 'en')).toBe('1.5 MB');
});

it('formats a release date in the current language', () => {
  // Midday UTC, so the day this formats to is the same one whatever timezone
  // the test runs in.
  expect(formatReleaseDate('2026-06-15T12:00:00Z', 'en')).toBe('Jun 15, 2026');
});

it('reports no date for a string that is not an instant', () => {
  // What `OffsetDateTime`'s own rendering looked like before the backend
  // formatted the date as RFC 3339: an offset carrying seconds is not a date
  // JavaScript reads, and formatting one throws rather than answering nothing.
  expect(formatReleaseDate('2026-06-15 12:00:00.0 +00:00:00', 'en')).toBeNull();
  expect(formatReleaseDate('', 'en')).toBeNull();
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
