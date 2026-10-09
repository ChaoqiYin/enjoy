import { useTranslation } from 'react-i18next';
import { Toast } from './Toast';
import { Button } from './ui/button';
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
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </Toast>
  );
}
