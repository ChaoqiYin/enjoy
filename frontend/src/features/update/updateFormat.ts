const UNITS = ['B', 'KB', 'MB', 'GB'];

/** Formats a byte count with the units of the current language. */
export function formatBytes(bytes: number, language: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const formatted = new Intl.NumberFormat(language, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${UNITS[unit]}`;
}

/**
 * The share of the download that is done, or null when there is nothing to
 * divide by. The server may answer without a content length, and a reported
 * total of zero would otherwise produce a ratio of infinity.
 */
export function progressRatio(
  downloaded: number,
  total: number | null,
): number | null {
  if (!total || total <= 0) return null;
  return Math.min(downloaded / total, 1);
}
