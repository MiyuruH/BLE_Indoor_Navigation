import { useCallback, useEffect, useState } from 'react';
import './App.css';
import IndoorNavigator from './components/IndoorNavigator.jsx';
import LandingPage from './components/LandingPage.jsx';
import SplashScreen from './components/SplashScreen.jsx';

function readViewFromLocation() {
  if (typeof window === 'undefined') return 'landing';
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'map' || window.location.hash === '#map') {
    return 'map';
  }
  return 'landing';
}

function updateHistoryView(nextView) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (nextView === 'map') {
      url.searchParams.set('view', 'map');
    } else {
      url.searchParams.delete('view');
    }
    url.hash = '';
    const nextHref = `${url.pathname}${url.search}`;
    if (`${window.location.pathname}${window.location.search}` !== nextHref) {
      window.history.pushState({ view: nextView }, '', nextHref);
    }
  } catch {
    // Ignore history API restrictions in embedded contexts
  }
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeView, setActiveView] = useState(readViewFromLocation);

  useEffect(() => {
    const onPopState = () => {
      setActiveView(readViewFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const rootEl = document.documentElement;
    if (activeView === 'map') {
      rootEl.classList.add('is-map-view');
    } else {
      rootEl.classList.remove('is-map-view');
    }
    return () => rootEl.classList.remove('is-map-view');
  }, [activeView]);

  const enterNavigation = useCallback(() => {
    setActiveView('map');
    updateHistoryView('map');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const returnToLanding = useCallback(() => {
    setActiveView('landing');
    updateHistoryView('landing');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleSplashDone = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <>
      {activeView === 'map' ? (
        <IndoorNavigator onBackHome={returnToLanding} />
      ) : (
        <LandingPage onStartNavigation={enterNavigation} />
      )}
      {showSplash && <SplashScreen durationMs={2000} onComplete={handleSplashDone} />}
    </>
  );
}
