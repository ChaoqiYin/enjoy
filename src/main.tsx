import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { initializeLanguage } from './language';
import english from './locales/en/common.json';
import chinese from './locales/zh-CN/common.json';
import './style.css';

const client = new QueryClient();
const root = createRoot(document.getElementById('root')!);
async function start() {
  try {
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
      <main className="p-10 space-y-4" role="alert">
        <p>{messages.startupFailed}</p>
        <button
          className="btn"
          onClick={() => {
            void start();
          }}
        >
          {messages.retry}
        </button>
      </main>,
    );
  }
}
void start();
