import React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FeaturesProvider } from './context/FeaturesContext';
import { BackendGate } from './context/BackendGate';
import App from './App';
import LoadingScreen from './components/LoadingScreen';
import UpdatePrompt from './components/UpdatePrompt';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './i18n';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/bebas-neue/400.css';
import './index.css';

// Expose React globally for plugin ESM modules (shim pattern). `react-dom/client` only carries
// createRoot/hydrateRoot — plugins that import { createPortal, flushSync } from 'react-dom'
// need the full namespace, so __LEMEDIA_REACT_DOM__ exposes that, not the client subpath.
(globalThis as any).__LEMEDIA_REACT__ = React;
(globalThis as any).__LEMEDIA_REACT_DOM__ = ReactDOM;
(globalThis as any).__LEMEDIA_JSX_RUNTIME__ = jsxRuntime;

// Do NOT listen for controllerchange and call location.reload(). This causes a flash-reload
// every time a new bundle deploys (skipWaiting + clientsClaim → controllerchange → reload).
// The SW's activate handler already clears stale caches; users get the new bundle on next
// navigation naturally.

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
    <BrowserRouter>
      <BackendGate fallback={<LoadingScreen />}>
        <AuthProvider>
          <FeaturesProvider>
            <App />
            <UpdatePrompt />
          </FeaturesProvider>
        </AuthProvider>
      </BackendGate>
    </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
