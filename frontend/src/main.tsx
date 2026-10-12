import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { WindowReveal } from './shared/WindowReveal';
import { Toast } from './shared/Toast';
import { Button } from './shared/ui/button';
import { App } from './app/App';
import { initializeLanguage } from './i18n/language';
import { readCurrentSpace } from './shared/api';
import english from '../../shared/locales/en/common.json';
import chinese from '../../shared/locales/zh-CN/common.json';
import './style.css';
import { initializeTheme } from './theme/ThemeSetting';

const client = new QueryClient();
const root = createRoot(document.getElementById('root')!);
async function start() {
  try {
    // Both are preferences read back from the backend and neither waits on the
    // other, so they are read together: in sequence they would be two round
    // trips charged to the window period one after the other.
    await Promise.all([initializeTheme(), initializeLanguage()]);
    // Read here rather than inside a provider, so a failure to read it lands in
    // the same startup notice the language read does.
    const space = await readCurrentSpace();
    root.render(
      <WindowReveal>
        <QueryClientProvider client={client}>
          <BrowserRouter>
            <App initialSpace={space} />
          </BrowserRouter>
        </QueryClientProvider>
      </WindowReveal>,
    );
  } catch {
    const messages = navigator.language.toLowerCase().startsWith('zh')
      ? chinese
      : english;
    root.render(
      // Behind the same reveal as the app: the window is shown by what this
      // component asks for, so a notice drawn outside it would be a failure
      // reported to nobody — the window would simply never appear.
      <WindowReveal>
        <Toast
          type="error"
          closeLabel={messages.close}
          onClose={() => root.render(null)}
        >
          <h3 className="font-bold">{messages.operationFailed}</h3>
          <p className="text-sm break-words">{messages.startupFailed}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void start();
            }}
          >
            {messages.retry}
          </Button>
        </Toast>
      </WindowReveal>,
    );
  }
}
void start();
