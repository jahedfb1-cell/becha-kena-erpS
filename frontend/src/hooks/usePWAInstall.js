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

/**
 * Captures the browser's native "beforeinstallprompt" event (fired once,
 * early, on Chrome/Edge/Android) so a button anywhere in the app — e.g.
 * the My Profile page — can trigger the install prompt on demand instead
 * of relying on the browser's own install icon.
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => isRunningStandalone());
  const [platform] = useState(detectPlatform);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return { outcome: 'unavailable' };
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
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
