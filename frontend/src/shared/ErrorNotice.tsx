import { useTranslation } from 'react-i18next';
import { Toast } from './Toast';
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
    <Toast type="error" closeLabel={t('close')} onClose={onClose}>
      <h3 className="font-bold">{t('operationFailed')}</h3>
      <p className="text-sm break-words">{message}</p>
      <p className="text-xs opacity-60 break-all">
        {t('errorId', { id: error.errorId })}
      </p>
      {onRetry && (
        <button
          className="btn btn-outline btn-sm btn-primary mt-2"
          onClick={onRetry}
        >
          {t('retry')}
        </button>
      )}
    </Toast>
  );
}
