import { describe, expect, it } from 'vitest';
import { displayPath } from './format';

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
