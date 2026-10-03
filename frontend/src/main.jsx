import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './store/AuthContext.jsx'
import { queryClient } from './api/queryClient.js'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker
//
// A service worker is only checked for a newer version when the page loads
// (plus the browser's own once-a-day check). The installed app and the APK's
// WebView are rarely reloaded - they are just put in the background and
// brought back - so they could keep running a build from days ago, missing
// every feature shipped since. Asking again whenever the app comes back to
// the foreground, and every half hour while it stays open, makes a deploy
// reach them within minutes; when a newer worker is found, autoUpdate
// activates it and reloads the page.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkForUpdate = () => {
      if (navigator.onLine) registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkForUpdate();
    });
    setInterval(checkForUpdate, 30 * 60 * 1000);
  },
})

// Every deploy ships content-hashed JS chunk filenames and deletes the
// previous build's files from the server, so a tab (or the APK's WebView,
// which doesn't get the same "just hit refresh" instinct a browser tab
// does) that's been sitting open since before a newer deploy can still be
// holding a route it hasn't visited yet - and the lazy `import()` for that
// route now 404s against a chunk that no longer exists, which React has no
// built-in way to recover from and renders as a blank white screen. Vite
// fires this exact event when one of its own dynamically-imported chunks
// fails to load, so listening for it and reloading is the standard fix:
// the fresh page load pulls the current index.html and current chunk
// filenames, and the failed navigation just works on the next attempt.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Sits outside AuthProvider so auth itself can use queries later on */}
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
