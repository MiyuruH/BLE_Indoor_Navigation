import './MapFabStack.css';

/**
 * Floating map badge, compass calibration toggle, 90-degree manual rotation,
 * and zoom/reset action stack.
 */
export default function MapFabStack({
  compassActive,
  mapRotationDeg,
  onToggleCompass,
  onRotate90,
  onZoomIn,
  onZoomOut,
  onResetView,
}) {
  return (
    <div className="map-fab-stack" aria-label="Map controls">
      <div
        className="map-floor-tile"
        aria-label="Active floor: 3rd Floor"
        title="Active Map: 3rd Floor"
      >
        <span className="map-floor-kicker">FLR</span>
        <strong className="map-floor-num">3</strong>
      </div>
      <button
        type="button"
        className={`fab-btn compass-btn ${compassActive || mapRotationDeg !== 0 ? 'is-active' : ''}`}
        onClick={onToggleCompass}
        aria-label="Toggle live compass rotation"
        title="Tap to toggle Live Compass / North-Up"
      >
        <span
          className="compass-needle"
          style={{ transform: `rotate(${mapRotationDeg}deg)` }}
        >
          🧭
        </span>
      </button>
      <button
        type="button"
        className="fab-btn"
        onClick={onRotate90}
        aria-label="Rotate map 90 degrees"
        title="Rotate map 90°"
      >
        ↻
      </button>
      <button type="button" className="fab-btn" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" className="fab-btn" onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <button type="button" className="fab-btn" onClick={onResetView} aria-label="Reset map view">
        ⟲
      </button>
    </div>
  );
}
