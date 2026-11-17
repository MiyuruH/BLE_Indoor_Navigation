import { useEffect, useRef, useState } from 'react';
import './ProjectGuide.css';

const DEMO_FLOORS = {
  '1F': {
    label: '1st Floor',
    locations: [
      { id: 'START', label: 'Lobby', x: 55, y: 26, rssi: null },
      { id: 'R1', label: 'No. 101', x: 85, y: 62, rssi: -54 },
      { id: 'R2', label: 'No. 102', x: 165, y: 48, rssi: -60 },
      { id: 'R3', label: 'No. 103', x: 165, y: 112, rssi: -66 },
      { id: 'R4', label: 'No. 104', x: 265, y: 62, rssi: -58 },
    ],
    routes: {
      'No. 102': {
        points: '55,36 115,36 165,36 165,52',
        destX: 165,
        destY: 52,
        turnIcon: '↱',
        primary: 'Go straight, then turn right',
        secondary: 'Destination No. 102 will be on your right',
        sec: 5,
      },
      'No. 103': {
        points: '55,36 165,36 165,112',
        destX: 165,
        destY: 112,
        turnIcon: '↱',
        primary: 'Turn right down central wing',
        secondary: 'Destination No. 103 is straight ahead',
        sec: 8,
      },
      'No. 104': {
        points: '55,36 265,36 265,62',
        destX: 265,
        destY: 62,
        turnIcon: '↑',
        primary: 'Head straight along 1st floor corridor',
        secondary: 'Destination No. 104 will be on your right',
        sec: 11,
      },
    },
  },
  '2F': {
    label: '2nd Floor',
    locations: [
      { id: 'START', label: 'Stairs', x: 55, y: 26, rssi: null },
      { id: 'R1', label: 'No. 201', x: 85, y: 62, rssi: -53 },
      { id: 'R2', label: 'No. 202', x: 165, y: 48, rssi: -59 },
      { id: 'R3', label: 'No. 203', x: 165, y: 112, rssi: -65 },
      { id: 'R4', label: 'No. 204', x: 265, y: 62, rssi: -56 },
    ],
    routes: {
      'No. 202': {
        points: '55,36 115,36 165,36 165,52',
        destX: 165,
        destY: 52,
        turnIcon: '↱',
        primary: 'Exit stairs, then turn right',
        secondary: 'Destination No. 202 will be on your right',
        sec: 6,
      },
      'No. 203': {
        points: '55,36 165,36 165,112',
        destX: 165,
        destY: 112,
        turnIcon: '↱',
        primary: 'Turn right into 2nd floor lab wing',
        secondary: 'Destination No. 203 is straight ahead',
        sec: 9,
      },
      'No. 204': {
        points: '55,36 265,36 265,62',
        destX: 265,
        destY: 62,
        turnIcon: '↑',
        primary: 'Continue straight past No. 201',
        secondary: 'Destination No. 204 will be on your right',
        sec: 12,
      },
    },
  },
  '3F': {
    label: '3rd Floor',
    locations: [
      { id: 'START', label: 'Entrance', x: 55, y: 26, rssi: null },
      { id: 'R1', label: 'No. 300', x: 85, y: 62, rssi: -52 },
      { id: 'R2', label: 'No. 301', x: 165, y: 48, rssi: -61 },
      { id: 'R3', label: 'No. 303', x: 165, y: 112, rssi: -68 },
      { id: 'R4', label: 'No. 305', x: 265, y: 62, rssi: -55 },
    ],
    routes: {
      'No. 301': {
        points: '55,36 115,36 165,36 165,52',
        destX: 165,
        destY: 52,
        turnIcon: '↱',
        primary: 'Go straight, then turn right',
        secondary: 'Destination No. 301 will be on your right',
        sec: 6,
      },
      'No. 303': {
        points: '55,36 165,36 165,112',
        destX: 165,
        destY: 112,
        turnIcon: '↱',
        primary: 'Turn right into central corridor',
        secondary: 'Destination No. 303 will be straight ahead',
        sec: 9,
      },
      'No. 305': {
        points: '55,36 265,36 265,62',
        destX: 265,
        destY: 62,
        turnIcon: '↑',
        primary: 'Continue straight down main hallway',
        secondary: 'Destination No. 305 will be on your right',
        sec: 12,
      },
    },
  },
};

const WALKTHROUGH_STEPS = [
  {
    id: 'locate',
    stepNum: 1,
    shortLabel: 'Locate',
    badge: 'STEP 1 OF 4 • POSITIONING',
    title: 'Set Your Floor & Current Location',
    subtitle: 'Auto-detect with BLE beacons or set your starting spot under "You Are In".',
    highlights: [
      {
        icon: '📡',
        label: 'Automatic BLE Detection',
        text: 'Tap "+ Add Beacon" or "Scan Nearby" in Chrome/Edge to track nearby beacons in real time as you walk.',
      },
      {
        icon: '👆',
        label: 'Manual Starting Spot',
        text: 'Testing without beacons? Select your current spot under "You Are In" inside the Rooms drawer.',
      },
    ],
    tip: 'Switch floors or click rooms in the preview to watch the blue route calculate live!',
  },
  {
    id: 'navigate',
    stepNum: 2,
    shortLabel: 'Navigate',
    badge: 'STEP 2 OF 4 • ROUTING',
    title: 'Pin Any Destination & Follow Turns',
    subtitle: 'Tap any room/corridor directly on the map or pick from the Rooms list.',
    highlights: [
      {
        icon: '🚩',
        label: 'Tap Map to Pin Destination',
        text: 'Tap directly on any room or corridor spot on the map (or search in Rooms) to drop the red pin and draw the live route.',
      },
      {
        icon: '↱',
        label: 'Turn-by-Turn Guidance',
        text: 'Follow the top green navigation banner for turn arrows, walking time, and left/right door side.',
      },
    ],
    tip: 'Switch floors or destination chips in the simulator to watch routes recalculate automatically!',
  },
  {
    id: 'controls',
    stepNum: 3,
    shortLabel: 'Controls',
    badge: 'STEP 3 OF 4 • MAP & GYROSCOPE',
    title: 'Align Route, Rotate & Live Person Indicator',
    subtitle: 'Selecting a room aligns the map once to your path while the phone gyroscope turns your indicator.',
    highlights: [
      {
        icon: '🧭',
        label: 'Gyroscope Heading Beam',
        text: 'The map stays steady after aligning your route while your blue person cone rotates smoothly as you turn. Tap Compass to toggle gyroscope tracking.',
      },
      {
        icon: '↻',
        label: 'Pan, Pinch & 90° Spin',
        text: 'Drag with one finger, pinch or scroll to zoom, or tap ↻ and ⟲ to rotate the map or reset North-Up while labels stay upright.',
      },
    ],
    tip: 'Click the floating buttons in the preview to test map rotation, zoom, and upright labels!',
  },
  {
    id: 'offline',
    stepNum: 4,
    shortLabel: 'Offline',
    badge: 'STEP 4 OF 4 • OFFLINE PWA',
    title: 'Install & Navigate 100% Offline',
    subtitle: 'Download the app once and use all mapped floors without internet.',
    highlights: [
      {
        icon: '📱',
        label: 'Mobile Top Pop-up',
        text: 'Tap "Install" on the top banner on Android (or Share → Add to Home Screen on iPhone/iPad).',
      },
      {
        icon: '💻',
        label: 'PC Address Bar Install',
        text: 'Click the install icon (⊕ / ⬇) in Chrome or Edge’s address bar to install it on desktop.',
      },
    ],
    tip: 'Toggle Online/Offline in the preview to see how cached device storage keeps navigation running!',
  },
];

const PIPELINE_STAGES = [
  {
    id: 'sense',
    icon: '📡',
    title: '1. Sense Floor & Room',
    short: 'BLE RSSI + Manual Tap',
    detail:
      'Reads Bluetooth Low Energy beacons installed across rooms, smooths RSSI via 1D Kalman filtering, estimates distance in meters with the log-distance path loss model, and maps your continuous position onto walkable corridor edges cleanly.',
  },
  {
    id: 'compute',
    icon: '⚡',
    title: '2. Compute Shortest Path',
    short: 'Live Corridor Routing',
    detail:
      'Models building entrances, corridor junctions, and room doorways as a connected navigation graph. Dijkstra updates the route polyline and remaining distance/time continuously from your live position.',
  },
  {
    id: 'guide',
    icon: '🧭',
    title: '3. Guide & Work Offline',
    short: 'Turn Banner + PWA Cache',
    detail:
      'Draws a glowing route line, announces left/right turns and door sides, aligns the map once to your route while tracking turns with the phone gyroscope indicator, and caches the full app via Service Worker so every feature works offline.',
  },
];

export default function ProjectGuide({
  isOpen,
  onClose,
  bleServiceUuid,
  roomCount,
  onOpenRooms,
}) {
  // 'walkthrough' | 'overview'
  const [viewMode, setViewMode] = useState('walkthrough');
  const [stepIndex, setStepIndex] = useState(0);

  const modalBodyRef = useRef(null);

  // Interactive simulator state
  const [demoFloor, setDemoFloor] = useState('3F');
  const [demoLocIndex, setDemoLocIndex] = useState(1);
  const [demoDestIndex, setDemoDestIndex] = useState(1);
  const [demoRotation, setDemoRotation] = useState(0);
  const [demoZoom, setDemoZoom] = useState(1);
  const [demoCompassOn, setDemoCompassOn] = useState(true);
  const [demoOfflineSim, setDemoOfflineSim] = useState(true);
  const [activePipeline, setActivePipeline] = useState('sense');

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (viewMode === 'walkthrough') {
        if (event.key === 'ArrowRight') {
          setStepIndex((prev) => Math.min(WALKTHROUGH_STEPS.length - 1, prev + 1));
        } else if (event.key === 'ArrowLeft') {
          setStepIndex((prev) => Math.max(0, prev - 1));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, viewMode]);

  useEffect(() => {
    if (isOpen && modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }
  }, [stepIndex, viewMode, isOpen]);

  if (!isOpen) return null;

  const currentStep = WALKTHROUGH_STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === WALKTHROUGH_STEPS.length - 1;

  const floorData = DEMO_FLOORS[demoFloor] || DEMO_FLOORS['3F'];
  const activeLoc = floorData.locations[demoLocIndex] || floorData.locations[0];
  const routeKeys = Object.keys(floorData.routes);
  const activeDestName = routeKeys[demoDestIndex] || routeKeys[0];
  const activeRoute = floorData.routes[activeDestName];
  const activeStageObj =
    PIPELINE_STAGES.find((s) => s.id === activePipeline) || PIPELINE_STAGES[0];

  const handleFinish = () => {
    if (onOpenRooms) {
      onOpenRooms();
    } else {
      onClose();
    }
  };

  return (
    <div className="guide-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP HEADER WITH MODE SWITCHER */}
        <header className="guide-modal-header">
          <div className="guide-header-top-row">
            <div className="guide-brand-row">
              <div className="guide-logo-orb" aria-hidden="true">
                🧭
              </div>
              <div className="guide-modal-heading-wrap">
                <span className="guide-kicker">ALL-FLOOR INDOOR NAVIGATION • INTERACTIVE GUIDE</span>
                <h2 id="guide-modal-title" className="guide-modal-title">
                  Smart Room Tracker — Building Wayfinder
                </h2>
              </div>
            </div>

            <button
              type="button"
              className="guide-modal-close"
              onClick={onClose}
              aria-label="Close guide"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          <div className="guide-mode-switch" role="tablist" aria-label="Guide view mode">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'walkthrough'}
              className={`guide-mode-btn ${viewMode === 'walkthrough' ? 'is-active' : ''}`}
              onClick={() => setViewMode('walkthrough')}
            >
              ✨ Step-by-Step Tour
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'overview'}
              className={`guide-mode-btn ${viewMode === 'overview' ? 'is-active' : ''}`}
              onClick={() => setViewMode('overview')}
            >
              💡 What Is This?
            </button>
          </div>
        </header>

        {/* MAIN BODY */}
        <div ref={modalBodyRef} className="guide-modal-body">
          {viewMode === 'walkthrough' ? (
            <div className="guide-tour-layout">
              {/* CLICKABLE STEP PROGRESS BAR */}
              <nav className="guide-stepper" aria-label="Tutorial progress">
                {WALKTHROUGH_STEPS.map((st, idx) => {
                  const isCurrent = idx === stepIndex;
                  const isDone = idx < stepIndex;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className={`guide-step-Tab ${isCurrent ? 'is-current' : ''} ${
                        isDone ? 'is-done' : ''
                      }`}
                      onClick={() => setStepIndex(idx)}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      <span className="guide-step-dot">{isDone ? '✓' : st.stepNum}</span>
                      <span className="guide-step-tab-label">{st.shortLabel}</span>
                    </button>
                  );
                })}
              </nav>

              {/* SPLIT VISUAL STAGE + STEP DETAILS */}
              <div className="guide-stage-grid" key={currentStep.id}>
                {/* INTERACTIVE GRAPHICAL SIMULATOR CANVAS */}
                <div className="guide-visual-canvas">
                  <div className="guide-canvas-header">
                    <span className="guide-live-pill">● INTERACTIVE DEMO</span>
                    {(stepIndex === 0 || stepIndex === 1) ? (
                      <div className="sim-floor-pills" aria-label="Sample floor switcher">
                        {Object.entries(DEMO_FLOORS).map(([key, fl]) => (
                          <button
                            key={key}
                            type="button"
                            className={`sim-floor-pill ${demoFloor === key ? 'is-active' : ''}`}
                            onClick={() => setDemoFloor(key)}
                          >
                            {fl.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="guide-canvas-hint">Tap controls to test</span>
                    )}
                  </div>

                  {/* STEP 1 VISUAL: MULTI-FLOOR BLE + TAP LOCATION SIMULATOR */}
                  {stepIndex === 0 && (
                    <div className="sim-box">
                      <svg viewBox="0 0 330 148" className="sim-svg" aria-label="Interactive location preview">
                        <rect x="12" y="12" width="306" height="124" rx="12" className="sim-floor" />
                        <line x1="28" y1="36" x2="298" y2="36" className="sim-corridor" />
                        <line x1="165" y1="36" x2="165" y2="122" className="sim-corridor" />

                        {floorData.locations.map((loc, idx) => {
                          const selected = idx === demoLocIndex;
                          return (
                            <g
                              key={loc.id}
                              className={`sim-node-group ${selected ? 'is-selected' : ''}`}
                              onClick={() => setDemoLocIndex(idx)}
                            >
                              <rect
                                x={loc.x - 29}
                                y={loc.y - 14}
                                width="58"
                                height="28"
                                rx="7"
                                className="sim-room-box"
                              />
                              <text x={loc.x} y={loc.y + 4} textAnchor="middle" className="sim-room-text">
                                {loc.label}
                              </text>
                            </g>
                          );
                        })}

                        <g
                          className="sim-user-marker"
                          style={{
                            transform: `translate(${activeLoc.x}px, ${activeLoc.y}px)`,
                          }}
                        >
                          <circle r="19" className="sim-user-pulse" />
                          <circle r="7.5" className="sim-user-dot" />
                        </g>
                      </svg>

                      <div className="sim-Interactive-bar">
                        <div className="sim-status-readout">
                          <span className="sim-dot-cyan" />
                          <span>
                            {floorData.label} • You are in: <strong>{activeLoc.label}</strong>
                            {activeLoc.rssi ? ` • BLE (${activeLoc.rssi} dBm)` : ' • Manual Spot'}
                          </span>
                        </div>
                        <div className="sim-chip-row">
                          {floorData.locations.map((loc, idx) => (
                            <button
                              key={loc.id}
                              type="button"
                              className={`sim-mini-btn ${idx === demoLocIndex ? 'is-active' : ''}`}
                              onClick={() => setDemoLocIndex(idx)}
                            >
                              {loc.rssi ? `📡 ${loc.label}` : `📍 ${loc.label}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 VISUAL: INTERACTIVE TURN-BY-TURN ROUTE SIMULATOR */}
                  {stepIndex === 1 && (
                    <div className="sim-box">
                      <div className="sim-turn-banner">
                        <div className="sim-turn-icon">{activeRoute.turnIcon}</div>
                        <div className="sim-turn-text">
                          <strong>{activeRoute.primary}</strong>
                          <span>
                            {floorData.label} • {activeRoute.secondary} • ~{activeRoute.sec} sec
                          </span>
                        </div>
                      </div>

                      <svg viewBox="0 0 330 135" className="sim-svg" aria-label="Interactive route preview">
                        <rect x="12" y="10" width="306" height="115" rx="12" className="sim-floor" />
                        <line x1="35" y1="36" x2="290" y2="36" className="sim-corridor" />
                        <line x1="165" y1="36" x2="165" y2="116" className="sim-corridor" />

                        <polyline points={activeRoute.points} className="sim-route-casing" />
                        <polyline points={activeRoute.points} className="sim-route-flow" />

                        <circle cx="55" cy="36" r="6.5" className="sim-user-dot" />
                        <text x="55" y="23" textAnchor="middle" className="sim-pin-label">
                          START
                        </text>

                        <g transform={`translate(${activeRoute.destX}, ${activeRoute.destY})`}>
                          <circle r="14" className="sim-dest-pulse" />
                          <circle r="6.5" className="sim-dest-dot" />
                          <text x="0" y="20" textAnchor="middle" className="sim-dest-label">
                            {activeDestName}
                          </text>
                        </g>
                      </svg>

                      <div className="sim-Interactive-bar">
                        <span className="sim-bar-caption">
                          Tap a destination on {floorData.label} to preview route:
                        </span>
                        <div className="sim-chip-row">
                          {routeKeys.map((rName, idx) => (
                            <button
                              key={rName}
                              type="button"
                              className={`sim-mini-btn ${idx === demoDestIndex ? 'is-active-green' : ''}`}
                              onClick={() => setDemoDestIndex(idx)}
                            >
                              🚩 {rName}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 VISUAL: INTERACTIVE ROTATION & COMPASS SIMULATOR */}
                  {stepIndex === 2 && (
                    <div className="sim-box">
                      <div className="sim-compass-stage">
                        <svg
                          viewBox="0 0 240 140"
                          className="sim-svg sim-rotatable"
                          style={{
                            transform: `scale(${demoZoom}) rotate(${demoRotation}deg)`,
                          }}
                        >
                          <rect x="24" y="14" width="192" height="110" rx="12" className="sim-floor" />
                          <line x1="45" y1="45" x2="195" y2="45" className="sim-corridor" />
                          <line x1="120" y1="45" x2="120" y2="108" className="sim-corridor" />
                          <polyline points="55,45 120,45 120,96" className="sim-route-flow" />

                          <g transform={`translate(72, 32) rotate(${-demoRotation})`}>
                            <text x="0" y="0" textAnchor="middle" className="sim-room-text">
                              Room A
                            </text>
                          </g>
                          <g transform={`translate(120, 106) rotate(${-demoRotation})`}>
                            <text x="0" y="0" textAnchor="middle" className="sim-dest-label">
                              Room B
                            </text>
                          </g>
                        </svg>

                        <div className="sim-fab-col">
                          <button
                            type="button"
                            className={`sim-fab ${demoCompassOn ? 'is-active' : ''}`}
                            onClick={() => {
                              setDemoCompassOn((v) => !v);
                              setDemoRotation((prev) => (prev === 0 ? -35 : 0));
                            }}
                            title="Toggle Heads-Up Compass"
                          >
                            🧭
                          </button>
                          <button
                            type="button"
                            className="sim-fab"
                            onClick={() => setDemoRotation((prev) => (prev - 90) % 360)}
                            title="Rotate 90°"
                          >
                            ↻
                          </button>
                          <button
                            type="button"
                            className="sim-fab"
                            onClick={() => setDemoZoom((z) => Math.min(1.25, Number((z + 0.12).toFixed(2))))}
                            title="Zoom In"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="sim-fab"
                            onClick={() => {
                              setDemoRotation(0);
                              setDemoZoom(1);
                            }}
                            title="Reset View"
                          >
                            ⟲
                          </button>
                        </div>
                      </div>

                      <div className="sim-Interactive-bar">
                        <span className="sim-bar-caption">
                          Map Angle: <strong>{demoRotation}°</strong> • Zoom:{' '}
                          <strong>{Math.round(demoZoom * 100)}%</strong> (Labels stay upright!)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* STEP 4 VISUAL: INTERACTIVE OFFLINE PWA SIMULATOR */}
                  {stepIndex === 3 && (
                    <div className="sim-box">
                      <div className="sim-pwa-preview">
                        {demoOfflineSim ? (
                          <div className="sim-offline-pill">
                            ⚡ Offline mode
                          </div>
                        ) : (
                          <div className="sim-online-pill">
                            🌐 Online – Service Worker cached 100% of floor maps &amp; app files
                          </div>
                        )}

                        <div className="sim-device-cards">
                          <div className="sim-device-card">
                            <span className="sim-device-icon">📱</span>
                            <div>
                              <strong>Mobile Top Pop-up</strong>
                              <p>Slides down at top of screen when loading on phone</p>
                            </div>
                          </div>
                          <div className="sim-device-card">
                            <span className="sim-device-icon">💻</span>
                            <div>
                              <strong>PC Address Bar</strong>
                              <p>Install icon appears inside Chrome / Edge URL bar</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="sim-Interactive-bar">
                        <span className="sim-bar-caption">Test connection state:</span>
                        <div className="sim-chip-row">
                          <button
                            type="button"
                            className={`sim-mini-btn ${demoOfflineSim ? 'is-active' : ''}`}
                            onClick={() => setDemoOfflineSim(true)}
                          >
                            ✈️ Simulate No Internet
                          </button>
                          <button
                            type="button"
                            className={`sim-mini-btn ${!demoOfflineSim ? 'is-active' : ''}`}
                            onClick={() => setDemoOfflineSim(false)}
                          >
                            🌐 Simulate Online
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* STEP EXPLANATION & ACTION HIGHLIGHTS */}
                <div className="guide-step-info">
                  <span className="guide-step-badge">{currentStep.badge}</span>
                  <h3 className="guide-step-title">{currentStep.title}</h3>
                  <p className="guide-step-sub">{currentStep.subtitle}</p>

                  <div className="guide-highlight-list">
                    {currentStep.highlights.map((h) => (
                      <div className="guide-highlight-card" key={h.label}>
                        <span className="guide-highlight-icon" aria-hidden="true">
                          {h.icon}
                        </span>
                        <div>
                          <strong>{h.label}</strong>
                          <p>{h.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="guide-tip-box">
                    <span aria-hidden="true">💡</span>
                    <span>{currentStep.tip}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* "WHAT IS THIS?" DEDICATED INTERACTIVE OVERVIEW (COMMON FOR ALL FLOORS) */
            <div className="guide-overview-layout">
              <section className="guide-overview-hero">
                <div className="guide-overview-copy">
                  <span className="guide-step-badge">WHAT IS THIS SYSTEM?</span>
                  <h3 className="guide-step-title">
                    Building-Wide Indoor Navigation for All Floors
                  </h3>
                  <p className="guide-step-sub">
                    Satellite GPS signals are blocked inside multi-story buildings. Smart Room
                    Tracker is a common indoor wayfinding platform built to guide users across
                    every floor of a building—combining interactive floor plans, Bluetooth Low
                    Energy (BLE) beacons, and on-device shortest-path routing (with{' '}
                    <strong>{roomCount} mapped rooms</strong> on the currently loaded floor).
                  </p>
                  <div className="guide-badges">
                    <span className="guide-badge">✓ Multi-Floor Architecture</span>
                    <span className="guide-badge">✓ Zero Internet Needed</span>
                    <span className="guide-badge">✓ Instant Shortest Route</span>
                    <span className="guide-badge">✓ Live Compass Rotation</span>
                  </div>
                </div>

                <div className="guide-compare-box">
                  <div className="guide-compare-row is-bad">
                    <span className="compare-icon">🛰️</span>
                    <div>
                      <strong>Standard Outdoor GPS</strong>
                      <p>Blocked by roofs &amp; concrete • Cannot separate floors or rooms</p>
                    </div>
                  </div>
                  <div className="guide-compare-row is-good">
                    <span className="compare-icon">📡</span>
                    <div>
                      <strong>Smart Room Tracker (BLE + PWA)</strong>
                      <p>Room &amp; floor accurate RSSI • Works 100% offline</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* INTERACTIVE "HOW IT WORKS" 3-STAGE PIPELINE */}
              <section className="guide-card">
                <div className="guide-section-head">
                  <h3 className="guide-heading">How It Works Across Any Floor (Click a Stage)</h3>
                  <span className="guide-sub-hint">Interactive Architecture</span>
                </div>

                <div className="guide-pipeline-tabs" role="tablist">
                  {PIPELINE_STAGES.map((stg) => (
                    <button
                      key={stg.id}
                      type="button"
                      role="tab"
                      aria-selected={activePipeline === stg.id}
                      className={`guide-pipeline-btn ${
                        activePipeline === stg.id ? 'is-active' : ''
                      }`}
                      onClick={() => setActivePipeline(stg.id)}
                    >
                      <span className="pipeline-icon">{stg.icon}</span>
                      <div className="pipeline-meta">
                        <strong>{stg.title}</strong>
                        <small>{stg.short}</small>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="guide-pipeline-detail">
                  <p>{activeStageObj.detail}</p>
                </div>
              </section>

              {/* WHY YOU NEED IT & HOW TO GET STARTED GRID */}
              <div className="guide-two-col">
                <section className="guide-card">
                  <h3 className="guide-heading">Why Use It &amp; Key Benefits</h3>
                  <ul className="guide-benefit-list">
                    <li>
                      <span>🏢</span>
                      <div>
                        <strong>Common Building-Wide Design:</strong> Scales cleanly across all
                        building floors using standardized room nodes, corridors, and beacon IDs.
                      </div>
                    </li>
                    <li>
                      <span>🧭</span>
                      <div>
                        <strong>Turn &amp; Door Side Guidance:</strong> Tells you which way to turn
                        and whether your destination door is on your left or right.
                      </div>
                    </li>
                    <li>
                      <span>✈️</span>
                      <div>
                        <strong>Works Without Wi-Fi or Data:</strong> Once installed as a PWA, maps
                        and shortest-path routing load instantly from device storage.
                      </div>
                    </li>
                  </ul>
                </section>

                <section className="guide-card guide-note">
                  <h3 className="guide-heading">Quick Start &amp; Browser Specs</h3>
                  <p className="guide-note-text">
                    <strong>Get Started Now:</strong> Pick your starting spot in the{' '}
                    <strong>Rooms</strong> tab (or tap any room on the floor map), then tap your
                    destination to start live guidance.
                  </p>
                  <p className="guide-note-text">
                    <strong>Web Bluetooth Support:</strong> Live beacon scanning works in{' '}
                    <strong>Chrome</strong> &amp; <strong>Edge</strong> on Android, Windows, macOS,
                    and Linux over HTTPS or <code>localhost</code>. (iOS Safari supports manual map
                    &amp; offline mode.)
                  </p>
                  <p className="guide-note-text">
                    <strong>Beacon Service UUID:</strong>{' '}
                    <code className="guide-uuid">{bleServiceUuid}</code>
                  </p>
                </section>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER WITH NEXT / PREVIOUS / SKIP / FINISH CONTROLS */}
        <footer className="guide-modal-footer">
          {viewMode === 'walkthrough' ? (
            <>
              <div className="guide-footer-left">
                <button
                  type="button"
                  className="guide-skip-btn"
                  onClick={onClose}
                >
                  Skip Tour
                </button>
                <span className="guide-step-counter">
                  Step {stepIndex + 1} of {WALKTHROUGH_STEPS.length}
                </span>
              </div>

              <div className="guide-footer-nav">
                <button
                  type="button"
                  className="btn-secondary-sm guide-nav-btn"
                  onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                  disabled={isFirstStep}
                >
                  ← Previous
                </button>

                {!isLastStep ? (
                  <button
                    type="button"
                    className="btn-primary-sm guide-nav-btn"
                    onClick={() =>
                      setStepIndex((prev) => Math.min(WALKTHROUGH_STEPS.length - 1, prev + 1))
                    }
                  >
                    Next Step →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary-sm guide-nav-btn guide-finish-btn"
                    onClick={handleFinish}
                  >
                    ✓ Finish &amp; Start
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary-sm guide-nav-btn"
                onClick={() => {
                  setViewMode('walkthrough');
                  setStepIndex(0);
                }}
              >
                ✨ 4-Step Visual Tour
              </button>
              <button
                type="button"
                className="btn-primary-sm guide-nav-btn guide-finish-btn"
                onClick={handleFinish}
              >
                Start Navigating →
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
