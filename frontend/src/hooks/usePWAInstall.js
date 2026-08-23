import { useState, useEffect, useCallback } from 'react';

// Detects the platform so we can show the right install instructions —
// Chrome/Edge/Android support the native beforeinstallprompt flow, but
// iOS Safari never fires that event and only supports Add to Home
// Screen via the Share sheet, so it needs its own manual instructions.
function detectPlatform() {
  const ua = window.navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isAndroid = /Android/.test(ua);
  return { isIOS, isSafariOnIOS: isIOS && isSafari, isAndroid };
}

function isRunningStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// Global listener captures beforeinstallprompt as soon as script runs,
// preventing the event from being lost before MyProfile or any component mounts.
let globalDeferredPrompt = null;
const promptListeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e;
    promptListeners.forEach((cb) => cb(globalDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((cb) => cb(null));
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(() => isRunningStandalone());
  const [platform] = useState(detectPlatform);

  useEffect(() => {
    // Sync current state in case event arrived before this component mounted
    if (globalDeferredPrompt !== deferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
    }

    const handler = (prompt) => {
      setDeferredPrompt(prompt);
      if (!prompt) {
        setIsInstalled(isRunningStandalone());
      }
    };

    promptListeners.add(handler);
    return () => {
      promptListeners.delete(handler);
    };
  }, [deferredPrompt]);

  const install = useCallback(async () => {
    const activePrompt = deferredPrompt || globalDeferredPrompt;
    if (!activePrompt) return { outcome: 'unavailable' };
    activePrompt.prompt();
    const choice = await activePrompt.userChoice;
    globalDeferredPrompt = null;
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') setIsInstalled(true);
    return choice;
  }, [deferredPrompt]);

  return {
    // True once Chrome/Edge/Android has offered a native install prompt.
    canInstall: !!deferredPrompt,
    isInstalled,
    isIOS: platform.isIOS,
    isSafariOnIOS: platform.isSafariOnIOS,
    isAndroid: platform.isAndroid,
    install,
  };
}
