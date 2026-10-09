import { useTranslation } from 'react-i18next';

/**
 * The strip along the bottom of the window: what this is, where the service is,
 * and how the platform is encoding.
 *
 * Both facts are the caller's to supply, because neither is the footer's to
 * work out: the port belongs to the service's own state, and whether the
 * platform encodes in hardware is a measurement only the platform can give.
 * `hardwareAcceleration` is therefore nullable, and `null` is not a third kind
 * of off — it is the interface saying it has not been told. A footer that
 * claimed one of the two states without a measurement would be inventing the
 * fact it exists to report.
 */
export function AppFooter({
  port,
  hardwareAcceleration,
}: {
  /** The port the service is listening on, or null when it is not running. */
  port: number | null;
  /** Whether the platform encodes in hardware, or null while nothing says. */
  hardwareAcceleration: boolean | null;
}) {
  const { t } = useTranslation();
  return (
    <footer className="shrink-0 border-t border-border bg-background px-4 py-2">
      <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
        <span>{t('footerProduct')}</span>
        <span className="flex items-center gap-2">
          {/* Nothing is listening while the service is down, and an empty slot
              beside the label reads as a fact that failed to arrive rather than
              as one that is not there. */}
          <span>{t('footerPort', { port: port ?? '—' })}</span>
          <span aria-hidden="true">•</span>
          <span>
            {t(
              hardwareAcceleration === null
                ? 'footerAccelerationUnknown'
                : hardwareAcceleration
                  ? 'footerAccelerationOn'
                  : 'footerAccelerationOff',
            )}
          </span>
        </span>
      </div>
    </footer>
  );
}
