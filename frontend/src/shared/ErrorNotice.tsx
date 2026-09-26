import { useTranslation } from 'react-i18next';
import { Toast } from './Toast';
import { errorMessage } from './errorMessage';
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
  const translator = useTranslation();
  const { t } = translator;
  const message = errorMessage(translator, error);
  return (
    <Toast type="error" closeLabel={t('close')} onClose={onClose}>
      <h3 className="font-bold">{t('operationFailed')}</h3>
      <p className="text-sm break-words">{message}</p>
      <p className="text-xs break-all">{t('errorId', { id: error.errorId })}</p>
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
