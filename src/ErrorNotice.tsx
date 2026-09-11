import { useTranslation } from 'react-i18next';
import type { AppError } from './api';

export function ErrorNotice({
  error,
  onRetry,
  onClose,
}: {
  error: AppError;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const key = `errors:${error.code}`;
  const message = i18n.exists(key)
    ? t(key, error.params)
    : t('errors:app.unexpected');
  return (
    <section
      role="alert"
      className="border border-error rounded-box p-4 space-y-2"
    >
      <p>{message}</p>
      <p className="text-sm">{t('errorId', { id: error.errorId })}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
      <button className="btn" onClick={onClose}>
        {t('close')}
      </button>
    </section>
  );
}
