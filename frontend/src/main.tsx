import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Toast } from './shared/Toast';
import { App } from './app/App';
import { initializeLanguage } from './i18n/language';
import { readCurrentSpace } from './features/space/space';
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
    // Read here rather than inside a provider, so a failure to read it lands in
    // the same startup notice the language read does.
    const space = await readCurrentSpace();
    root.render(
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <App space={space} />
        </BrowserRouter>
      </QueryClientProvider>,
    );
  } catch {
    const messages = navigator.language.toLowerCase().startsWith('zh')
      ? chinese
      : english;
    root.render(
      <Toast
        type="error"
        closeLabel={messages.close}
        onClose={() => root.render(null)}
      >
        <h3 className="font-bold">{messages.operationFailed}</h3>
        <p className="text-sm break-words">{messages.startupFailed}</p>
        <button
          className="btn btn-outline btn-sm btn-primary mt-2"
          onClick={() => {
            void start();
          }}
        >
          {messages.retry}
        </button>
      </Toast>,
    );
  }
}
void start();
