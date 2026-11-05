import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import { I18nProvider } from '@/shared/i18n';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
