import { useTranslation } from 'react-i18next';
import { ErrorToast } from './ErrorToast';
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
    <ErrorToast
      title={t('operationFailed')}
      description={message}
      reference={t('errorId', { id: error.errorId })}
      retryLabel={t('retry')}
      closeLabel={t('close')}
      onRetry={onRetry}
      onClose={onClose}
    />
  );
}
