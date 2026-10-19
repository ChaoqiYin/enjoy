import { useTranslation } from 'react-i18next';
import { PageFrame } from '../features/library/PageFrame';
import { ScrollViewport } from '../shared/ScrollViewport';

export function TasksPage() {
  const { t } = useTranslation();

  return (
    <PageFrame>
      <ScrollViewport className="min-h-0 space-y-4">
        <p className="text-sm text-muted-foreground">{t('tasks')}</p>
      </ScrollViewport>
    </PageFrame>
  );
}
