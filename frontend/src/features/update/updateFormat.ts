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
 * A release date in the current language, or null when the string that arrived
 * is not an instant this runtime can read.
 *
 * The date comes off the network, and `Intl.DateTimeFormat` answers an invalid
 * date by throwing rather than by formatting something. A throw while rendering
 * is not a missing date — React unmounts the tree it happened in, so the cost
 * would be the whole screen. Reading the string defensively is what keeps a
 * date nobody can parse down to the one line it belongs to.
 */
export function formatReleaseDate(
  date: string,
  language: string,
): string | null {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
    parsed,
  );
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
