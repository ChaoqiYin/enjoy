import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ErrorToast } from './shared/ErrorToast';
import { App } from './app/App';
import { initializeLanguage } from './i18n/language';
import english from '../../shared/locales/en/common.json';
import chinese from '../../shared/locales/zh-CN/common.json';
import './style.css';
import { initializeTheme } from './theme/ThemeSetting';

const client = new QueryClient();
const root = createRoot(document.getElementById('root')!);
async function start() {
  try {
    initializeTheme();
    await initializeLanguage();
    root.render(
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>,
    );
  } catch {
    const messages = navigator.language.toLowerCase().startsWith('zh')
      ? chinese
      : english;
    root.render(
      <ErrorToast
        title={messages.operationFailed}
        description={messages.startupFailed}
        retryLabel={messages.retry}
        closeLabel={messages.close}
        onRetry={() => {
          void start();
        }}
        onClose={() => root.render(null)}
      />,
    );
  }
}
void start();
