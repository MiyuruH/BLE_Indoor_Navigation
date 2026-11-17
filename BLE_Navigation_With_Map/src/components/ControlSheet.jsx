import './ControlSheet.css';
import { NODE_LABELS, rooms } from '../data/floorplanData.js';

/**
 * Responsive bottom drawer (mobile/tablet) and collapsible sidebar (desktop)
 * containing room navigation controls, BLE beacon status, and About/Guide trigger.
 */
export default function ControlSheet({
  panelOpen,
  onTogglePanel,
  currentLocationNode,
  statusMessage,
  activeTab,
  onChangeTab,
  visibleRooms,
  roomSearch,
  onRoomSearchChange,
  selectedRoomId,
  activeDestination,
  routeMetrics,
  onMoveUserToNode,
  onStatusMessage,
  onSelectDestinationRoom,
  onClearNavigation,
  debugBeacons,
  isScanningAll,
  onConnectBeacon,
  onStartAutoScan,
  onOpenGuide,
  onBackHome,
}) {
  return (
    <aside
      className={`control-sheet ${panelOpen ? 'is-open' : 'is-hidden'}`}
      aria-label="Navigation panel"
    >
      <button
        type="button"
        className="pc-sidebar-edge-tab"
        onClick={onTogglePanel}
        aria-expanded={panelOpen}
        aria-label={panelOpen ? 'Hide sidebar' : 'Show sidebar'}
        title={panelOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <span className="pc-sidebar-edge-arrow" aria-hidden="true">
          {panelOpen ? '◀' : '▶'}
        </span>
        <span className="pc-sidebar-edge-label">
          {panelOpen ? 'Hide' : 'Menu'}
        </span>
      </button>

      <div
        className="sheet-header"
        onClick={onTogglePanel}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onTogglePanel();
          }
        }}
      >
        <span className="sheet-grabber" />
        <div className="sheet-summary-row">
          <div className="location-summary">
            <span className="summary-dot" />
            <span className="summary-label">You are in:</span>
            <strong className="summary-value">
              {NODE_LABELS[currentLocationNode] || currentLocationNode}
            </strong>
          </div>
          <button
            type="button"
            className="sheet-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePanel();
            }}
          >
            <span className="mobile-toggle-text">{panelOpen ? 'Hide ▼' : 'Rooms ▲'}</span>
            <span className="pc-toggle-text">{panelOpen ? '◀ Hide' : 'Show ▶'}</span>
          </button>
        </div>
      </div>

      <div className="sheet-body">
        <div className="status-strip">{statusMessage}</div>

        <div className="sheet-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rooms'}
            className={`tab-btn ${activeTab === 'rooms' ? 'active' : ''}`}
            onClick={() => onChangeTab('rooms')}
          >
            Rooms ({rooms.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'beacons'}
            className={`tab-btn ${activeTab === 'beacons' ? 'active' : ''}`}
            onClick={() => onChangeTab('beacons')}
          >
            BLE Beacons ({debugBeacons.length})
          </button>
        </div>

        <div className="sheet-content">
          {activeTab === 'rooms' && (
            <div className="tab-pane">
              <div className="active-floor-bar">
                <span className="active-floor-label">🏢 Active Map</span>
                <div className="active-floor-actions">
                  <span className="active-floor-pill">3rd Floor</span>
                  {onBackHome && (
                    <button
                      type="button"
                      className="home-back-pill"
                      onClick={onBackHome}
                      title="Back to NavSense landing page"
                    >
                      ← Home
                    </button>
                  )}
                </div>
              </div>

              {/* 1. CURRENT LOCATION SELECTOR (WHERE YOU ARE NOW) */}
              <div className="section-block">
                <div className="section-label">📍 You Are In (Current Room / Spot):</div>
                <div className="start-room-strip">
                  <button
                    type="button"
                    className={`start-pill ${currentLocationNode === 'START' ? 'is-active' : ''}`}
                    onClick={() => {
                      onMoveUserToNode('START', 'manual');
                      onStatusMessage('You are at Main Entrance.');
                    }}
                  >
                    Entrance
                  </button>
                  {rooms.map((room) => {
                    const isHere = currentLocationNode === room.targetNode;
                    return (
                      <button
                        key={`start-${room.id}`}
                        type="button"
                        className={`start-pill ${isHere ? 'is-active' : ''}`}
                        onClick={() => {
                          onMoveUserToNode(room.targetNode, 'manual');
                          onStatusMessage(`You are inside ${room.name}.`);
                        }}
                      >
                        {room.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. DESTINATION SELECTOR (WHERE TO GO) */}
              <div className="section-block">
                <div className="section-label">🚩 Where to Go (Destination Room):</div>
                <div className="search-input-wrap">
                  <input
                    type="search"
                    className="search-input"
                    value={roomSearch}
                    onChange={(e) => onRoomSearchChange(e.target.value)}
                    placeholder="Search destination room (No. 300 - No. 305)..."
                  />
                </div>

                <div className="room-grid">
                  {visibleRooms.map((room) => {
                    const isDest = selectedRoomId === room.id;
                    const isStart = currentLocationNode === room.targetNode;

                    return (
                      <button
                        key={room.id}
                        type="button"
                        className={`room-chip ${isDest ? 'is-dest' : ''} ${
                          isStart ? 'is-start' : ''
                        }`}
                        onClick={() => onSelectDestinationRoom(room, true)}
                      >
                        <span className="room-chip-name">{room.name}</span>
                        {isDest && <span className="chip-badge badge-go">GO</span>}
                        {!isDest && isStart && <span className="chip-badge badge-here">HERE</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeDestination && (
                <div className="active-route-card">
                  <div className="route-stat-grid">
                    <div className="route-stat">
                      <span className="stat-label">From</span>
                      <strong className="stat-val">{NODE_LABELS[currentLocationNode]}</strong>
                    </div>
                    <div className="route-stat">
                      <span className="stat-label">To</span>
                      <strong className="stat-val accent">{activeDestination.name}</strong>
                    </div>
                    <div className="route-stat">
                      <span className="stat-label">Remaining</span>
                      <strong className="stat-val green">
                        {routeMetrics.seconds
                          ? `~${routeMetrics.distanceMeters}m • ~${routeMetrics.seconds}s`
                          : 'Arrived'}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-danger-outline"
                    onClick={onClearNavigation}
                  >
                    Clear Route
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'beacons' && (
            <div className="tab-pane">
              <div className="ble-header-card">
                <div className="ble-header-info">
                  <div className="ble-status-title">BLE room beacons</div>
                  <div className="ble-status-sub">
                    Scan to monitor
                  </div>
                </div>
                <div className="ble-btn-group">
                  <button
                    type="button"
                    className="btn-primary-sm"
                    onClick={onConnectBeacon}
                  >
                    + Add Beacon
                  </button>
                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={onStartAutoScan}
                  >
                    {isScanningAll ? 'Stop Scan' : 'Scan Nearby'}
                  </button>
                </div>
              </div>

              <div className="debug-list">
                {debugBeacons.length === 0 ? (
                  <div className="empty-ble-state">
                    <p>No active beacons detected yet.</p>
                    <small>Scan nearby beacons</small>
                  </div>
                ) : (
                  debugBeacons.map((beacon) => {
                    const ageSeconds = beacon.ageSeconds ?? 0;
                    const rssiVal = Math.round(beacon.smoothedRssi);
                    const strengthClass =
                      rssiVal < -75 ? 'weak' : rssiVal < -60 ? 'medium' : 'strong';

                    return (
                      <div className="debug-row" key={beacon.canonicalName}>
                        <div className="debug-info">
                          <div className="debug-name">
                            <span>{beacon.canonicalName}</span>
                            <span className="auth-tag">
                              {beacon.authenticated ? '✓ UUID' : '✓ Valid'}
                            </span>
                          </div>
                          <div className="debug-meta">
                            {NODE_LABELS[beacon.targetNode]} •{' '}
                            {typeof beacon.distanceMeters === 'number'
                              ? `~${beacon.distanceMeters.toFixed(1)} m • `
                              : ''}
                            {beacon.isLive
                              ? `${ageSeconds}s ago`
                              : `Out of range • last seen ${ageSeconds}s ago`}
                          </div>
                        </div>
                        <div className={`debug-rssi ${strengthClass}`}>{rssiVal} dBm</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="sidebar-about-footer"
          onClick={onOpenGuide}
        >
          <span className="sidebar-about-icon" aria-hidden="true">
            ℹ
          </span>
          <span className="sidebar-about-text">
            <strong>About &amp; User Guide</strong>
            <small>What this project is for &amp; how to use</small>
          </span>
          <span className="sidebar-about-pill">View ↗</span>
        </button>
      </div>
    </aside>
  );
}
