import { describe, expect, it } from 'vitest';
import { displayPath, formatDateTime } from './format';

describe('path display', () => {
  it('drops the verbatim prefix a resolved Windows path carries', () => {
    expect(displayPath('\\\\?\\E:\\movies\\example.mp4')).toBe(
      'E:\\movies\\example.mp4',
    );
  });
  it('puts a verbatim network path back into its usual form', () => {
    expect(displayPath('\\\\?\\UNC\\server\\share\\example.mp4')).toBe(
      '\\\\server\\share\\example.mp4',
    );
  });
  it('leaves a path that carries no prefix as it is', () => {
    for (const path of [
      'E:\\movies\\example.mp4',
      '/movies/example.mp4',
      '\\\\server\\share\\example.mp4',
      'movies\\example.mp4',
      '',
    ]) {
      expect(displayPath(path)).toBe(path);
    }
  });
});

describe('date and time display', () => {
  it('shows a medium date and a short time in the language', () => {
    const formatted = formatDateTime(
      new Date(2025, 0, 2, 15, 4).getTime(),
      'en',
    );
    expect(formatted).toContain('2025');
    expect(formatted).toContain('Jan');
  });
  it('falls back to the raw number when the instant cannot be read', () => {
    expect(formatDateTime(Number.NaN, 'en')).toBe('NaN');
  });
});
