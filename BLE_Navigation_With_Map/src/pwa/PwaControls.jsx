import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './pwa.css';

const INSTALLED_STORAGE_KEY = 'indoor_nav_pwa_installed';
const DISMISSED_SESSION_KEY = 'indoor_nav_pwa_banner_dismissed';

const markInstalledInStorage = () => {
  try {
    window.localStorage?.setItem(INSTALLED_STORAGE_KEY, '1');
  } catch {
    // Ignore storage errors in private browsing
  }
};

const isRunningAsInstalledPwa = () => {
  if (typeof window === 'undefined') return false;
  const displayModes = [
    '(display-mode: standalone)',
    '(display-mode: minimal-ui)',
    '(display-mode: fullscreen)',
    '(display-mode: window-controls-overlay)',
  ];
  if (displayModes.some((q) => window.matchMedia?.(q).matches)) {
    markInstalledInStorage();
    return true;
  }
  if (window.navigator.standalone === true) {
    markInstalledInStorage();
    return true;
  }
  if (typeof document !== 'undefined' && document.referrer.includes('android-app://')) {
    markInstalledInStorage();
    return true;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'pwa') {
      markInstalledInStorage();
      return true;
    }
    if (window.localStorage?.getItem(INSTALLED_STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    // Ignore URL/storage errors
  }
  return false;
};

const isDismissedInSession = () => {
  try {
    return window.sessionStorage?.getItem(DISMISSED_SESSION_KEY) === '1';
  } catch {
    return false;
  }
};

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

const isMobileDevice = () => {
  const ua = window.navigator.userAgent || '';
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return true;
  if (window.navigator.userAgentData?.mobile) return true;
  return window.matchMedia?.('(max-width: 768px) and (pointer: coarse)').matches ?? false;
};

// Chrome can fire `beforeinstallprompt` BEFORE React mounts this component.
// Capture it at module load so the Install button never misses it.
let deferredInstallEvent = null;
const installEventSubscribers = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // If Chrome fires beforeinstallprompt, the app is currently not installed on this device
    try {
      if (!isRunningAsInstalledPwa()) {
        window.localStorage?.removeItem(INSTALLED_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
    // Only intercept on mobile so PC browsers keep their normal address-bar install icon/popup
    if (!isMobileDevice()) return;
    e.preventDefault();
    deferredInstallEvent = e;
    installEventSubscribers.forEach((fn) => fn(e));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallEvent = null;
    markInstalledInStorage();
  });
}

export default function PwaControls() {
  const [installEvent, setInstallEvent] = useState(() => deferredInstallEvent);
  const [installed, setInstalled] = useState(() => isRunningAsInstalledPwa());
  const [online, setOnline] = useState(navigator.onLine);
  const [isMobile, setIsMobile] = useState(isMobileDevice());
  const [dismissedBanner, setDismissedBanner] = useState(() => isDismissedInSession());
  const [showMobileHint, setShowMobileHint] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });

  useEffect(() => {
    const onBeforeInstall = (e) => {
      setInstallEvent(e);
      setInstalled(false);
    };
    installEventSubscribers.add(onBeforeInstall);
    if (deferredInstallEvent) setInstallEvent(deferredInstallEvent);

    const onInstalled = () => {
      markInstalledInStorage();
      setInstalled(true);
      setInstallEvent(null);
      setDismissedBanner(true);
      setShowMobileHint(false);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onResize = () => setIsMobile(isMobileDevice());

    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('resize', onResize);

    // Check WebAPK / related installed apps if supported by mobile Chrome
    if (typeof navigator.getInstalledRelatedApps === 'function') {
      navigator
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            markInstalledInStorage();
            setInstalled(true);
          }
        })
        .catch(() => {});
    }

    const standaloneQuery = window.matchMedia?.('(display-mode: standalone)');
    const minimalUiQuery = window.matchMedia?.('(display-mode: minimal-ui)');
    const onDisplayModeChange = (e) => {
      if (e.matches) {
        markInstalledInStorage();
        setInstalled(true);
      }
    };
    standaloneQuery?.addEventListener?.('change', onDisplayModeChange);
    minimalUiQuery?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      installEventSubscribers.delete(onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('resize', onResize);
      standaloneQuery?.removeEventListener?.('change', onDisplayModeChange);
      minimalUiQuery?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    if (!offlineReady) return undefined;
    const t = setTimeout(() => setOfflineReady(false), 5000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  const handleInstall = async () => {
    if (installEvent) {
      installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === 'accepted') {
        markInstalledInStorage();
        setInstalled(true);
        setDismissedBanner(true);
      }
      deferredInstallEvent = null;
      setInstallEvent(null);
    } else {
      setShowMobileHint(true);
    }
  };

  const handleDismiss = () => {
    try {
      window.sessionStorage?.setItem(DISMISSED_SESSION_KEY, '1');
    } catch {
      // Ignore storage errors
    }
    setDismissedBanner(true);
    setShowMobileHint(false);
  };

  const showMobileInstallPopup = isMobile && !installed && !dismissedBanner;

  return (
    <div className="pwa-layer" aria-live="polite">
      {/* Top area: Mobile-only Install Pop-up */}
      <div className="pwa-top-stack">
        {showMobileInstallPopup && (
          <div className="pwa-install-popup" role="dialog" aria-label="Install app">
            <img
              src="/icons/pwa-192x192.png"
              alt=""
              className="pwa-install-popup-icon"
            />
            <div className="pwa-install-popup-text">
              <strong>Install Indoor Nav</strong>
              <span>
                {showMobileHint ? (
                  isIos() ? (
                    <>Tap <strong>Share</strong> below, then <strong>Add to Home Screen</strong>.</>
                  ) : (
                    <>Tap browser menu <strong>(⋮)</strong> → <strong>Add to Home screen / Install app</strong>.</>
                  )
                ) : (
                  'Download to your phone for instant offline navigation.'
                )}
              </span>
            </div>
            {!showMobileHint ? (
              <button
                type="button"
                className="pwa-install-popup-action"
                onClick={handleInstall}
              >
                Install
              </button>
            ) : (
              <button
                type="button"
                className="pwa-install-popup-action"
                onClick={() => {
                  markInstalledInStorage();
                  setInstalled(true);
                  handleDismiss();
                }}
              >
                Done
              </button>
            )}
            <button
              type="button"
              className="pwa-install-popup-close"
              aria-label="Dismiss install banner"
              onClick={handleDismiss}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Bottom toasts (offline badge / offline ready / update available) */}
      <div className="pwa-bottom-stack">
        {!online && (
          <div className="pwa-offline-badge">
            Offline mode
          </div>
        )}

        {offlineReady && (
          <div className="pwa-toast">
            <span>App is ready to work offline.</span>
            <button type="button" onClick={() => setOfflineReady(false)}>OK</button>
          </div>
        )}

        {needRefresh && (
          <div className="pwa-toast">
            <span>A new version is available.</span>
            <button type="button" onClick={() => updateServiceWorker(true)}>Update</button>
            <button type="button" className="ghost" onClick={() => setNeedRefresh(false)}>Later</button>
          </div>
        )}
      </div>
    </div>
  );
}
