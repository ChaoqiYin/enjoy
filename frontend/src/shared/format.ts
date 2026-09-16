/**
 * The path as the interface shows it.
 *
 * Windows filesystem APIs that resolve a path hand it back in verbatim form:
 * `\\?\E:\...` for a drive path, `\\?\UNC\server\share\...` for a network one.
 * The prefix exists so long paths and reserved names survive those APIs; it is
 * not part of the path anyone typed or recognises, and it is only noise in the
 * interface, so display drops it.
 *
 * Only display drops it. Every other use keeps the verbatim form: it is what
 * the scan indexed, and the stored records, the filters and the paths sent
 * back to the backend are compared against it.
 */
export function displayPath(path: string): string {
  const verbatim = '\\\\?\\';
  if (!path.startsWith(verbatim)) return path;
  const remainder = path.slice(verbatim.length);
  return /^UNC\\/i.test(remainder) ? `\\\\${remainder.slice(4)}` : remainder;
}

export function duration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const parts = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ];
  return parts.map((value) => String(value).padStart(2, '0')).join(':');
}

export function fileSize(bytes: number, language: string): string {
  const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
  const index = size > 0 ? Math.min(4, Math.floor(Math.log10(size) / 3)) : 0;
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: units[Math.max(0, index)],
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(size / 1000 ** Math.max(0, index));
}
