import './TopHud.css';
import { NODE_LABELS } from '../data/floorplanData.js';

/**
 * Top floating header bar, BLE quick action pill, mobile reload button,
 * live turn-by-turn navigation banner, and collapsible status toast.
 */
export default function TopHud({
  isScanningAll,
  debugBeaconsCount,
  liveBeaconCount,
  onConnectBeacon,
  isReloading,
  onMobileReload,
  activeDestination,
  guidance,
  currentLocationNode,
  routeMetrics,
  onClearNavigation,
  mapToast,
  onDismissMapToast,
}) {
  return (
    <header className="top-hud">
      <div className="hud-bar">
        <div className="brand-text">
          <span className="brand-kicker">BLE INDOOR NAVIGATION</span>
          <h1 className="brand-title">Smart Room Tracker</h1>
        </div>

        <div className="hud-bar-actions">
          <button
            type="button"
            className={`ble-pill-btn ${isScanningAll || debugBeaconsCount > 0 ? 'is-live' : ''}`}
            onClick={onConnectBeacon}
          >
            <span className="ble-dot" />
            <span>
              {debugBeaconsCount > 0
                ? `BLE (${liveBeaconCount}) • + Add`
                : '+ Add Beacon'}
            </span>
          </button>
          <button
            type="button"
            className={`mobile-reload-btn ${isReloading ? 'is-spinning' : ''}`}
            onClick={onMobileReload}
            disabled={isReloading}
            aria-label="Reload app"
            title="Reload page"
          >
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
        </div>
      </div>

      {activeDestination && guidance && (
        <div className="turn-banner" role="status" aria-live="polite">
          <div className="turn-direction-box" aria-hidden="true">
            {guidance.icon}
          </div>
          <div className="turn-body">
            <div className="turn-primary">{guidance.primaryText}</div>
            <div className="turn-destination-side">{guidance.secondaryText}</div>
            <div className="turn-meta">
              {guidance.arrived
                ? `You are at ${activeDestination.name}`
                : `${NODE_LABELS[currentLocationNode]} → ${activeDestination.name} • ~${routeMetrics.distanceMeters} m • ~${routeMetrics.seconds} sec`}
            </div>
          </div>
          <button
            type="button"
            className="turn-close-btn"
            onClick={onClearNavigation}
            aria-label="Clear route"
          >
            Exit
          </button>
        </div>
      )}

      {mapToast && (
        <button
          type="button"
          className="map-status-toast"
          onClick={onDismissMapToast}
          role="status"
          aria-live="polite"
          title="Tap to dismiss"
        >
          {mapToast}
        </button>
      )}
    </header>
  );
}
