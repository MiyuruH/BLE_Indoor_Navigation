import { useEffect, useState } from 'react';
import './SplashScreen.css';

/**
 * Displays a calm 2-second architectural splash screen on launch
 * while initializing NavSense floor-plan and sensor modules.
 */
export default function SplashScreen({ durationMs = 2000, onComplete }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fadeDelay = Math.max(0, durationMs - 320);
    const fadeTimer = setTimeout(() => setLeaving(true), fadeDelay);
    const doneTimer = setTimeout(() => onComplete?.(), durationMs);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [durationMs, onComplete]);

  return (
    <div
      className={`splash-screen ${leaving ? 'is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading NavSense Smart Building System"
    >
      <div className="splash-inner">
        <div className="splash-orbit" aria-hidden="true">
          <div className="splash-ring" />
          <img
            src="/assets/rajarata-university-logo-white.png"
            alt=""
            className="splash-crest"
          />
        </div>

        <p className="splash-wordmark">
          Nav<span>Sense</span>
        </p>
        <p className="splash-subtitle">
          Faculty of Technology &middot; Rajarata University of Sri Lanka
        </p>

        <div className="splash-progress-track" aria-hidden="true">
          <div className="splash-progress-bar" />
        </div>
        <p className="splash-status">Initializing Indoor Navigation...</p>
      </div>
    </div>
  );
}
