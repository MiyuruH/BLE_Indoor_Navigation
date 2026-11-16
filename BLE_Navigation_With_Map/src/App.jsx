import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import ProjectGuide from './components/ProjectGuide.jsx';
import {
  bearingDegBetweenPoints,
  buildWalkableEdges,
  computeLiveRouteFromPosition,
  computeRealtimeGuidance,
  extractPhoneHeadingDeg,
  getShortestPathData,
  kalmanUpdateRssi,
  normalizeDeltaDeg,
  pointForNode as navPointForNode,
  resolveRouteJunctionHeading,
  rssiToDistanceMeters,
  snapPointToEdges,
  solveRealtimeBeaconPosition,
} from './utils/indoorNavigation.js';

const MAP_WIDTH = 1102;
const MAP_HEIGHT = 1672;
const BLE_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
const BEACON_FILTERS = [
  { name: 'a01' },
  { name: 'b01' },
  { namePrefix: 'No.' },
  { services: [BLE_SERVICE_UUID] },
];
const BEACON_TIMEOUT_MS = 15000;
const RSSI_SAMPLE_INTERVAL_MS = 200;
const RSSI_SAMPLE_WINDOW = 7;
const MIN_RSSI_SAMPLES = 1;

const nodes = {
  START: [55, 137],
  N_ROOM1: [185, 137],
  D_ROOM1: [185, 689],
  MAIN_CROSS: [795, 137],
  N_ROOM2_4: [795, 485],
  D_ROOM2: [517, 485],
  D_ROOM4: [1081, 485],
  N_ROOM3_5: [795, 890],
  D_ROOM3: [517, 890],
  D_ROOM5: [1081, 890],
  N_ROOM6: [1449, 137],
  D_ROOM6: [1449, 689],
};

const NODE_LABELS = {
  START: 'Main Entrance',
  N_ROOM6: 'Hallway near No. 305',
  D_ROOM6: 'No. 305',
  MAIN_CROSS: 'Main Junction',
  N_ROOM2_4: 'Left Junction',
  D_ROOM2: 'No. 301',
  D_ROOM4: 'No. 303',
  N_ROOM3_5: 'Right Junction',
  D_ROOM3: 'No. 302',
  D_ROOM5: 'No. 304',
  N_ROOM1: 'Hallway near No. 300',
  D_ROOM1: 'No. 300',
};

const graph = {
  START: ['N_ROOM1'],
  N_ROOM1: ['START', 'MAIN_CROSS', 'D_ROOM1'],
  D_ROOM1: ['N_ROOM1'],
  MAIN_CROSS: ['N_ROOM1', 'N_ROOM6', 'N_ROOM2_4'],
  N_ROOM6: ['D_ROOM6', 'MAIN_CROSS'],
  D_ROOM6: ['N_ROOM6'],
  N_ROOM2_4: ['MAIN_CROSS', 'N_ROOM3_5', 'D_ROOM2', 'D_ROOM4'],
  D_ROOM2: ['N_ROOM2_4'],
  D_ROOM4: ['N_ROOM2_4'],
  N_ROOM3_5: ['N_ROOM2_4', 'D_ROOM3', 'D_ROOM5'],
  D_ROOM3: ['N_ROOM3_5'],
  D_ROOM5: ['N_ROOM3_5'],
};

const rooms = [
  {
    id: 'r1',
    name: 'No. 300',
    targetNode: 'D_ROOM1',
    center: [689, 185],
    door: [284.5, 185],
    polygon: [[15, 284.5], [15, 1094.5], [356.5, 1094.5], [356.5, 284.5]],
  },
  {
    id: 'r2',
    name: 'No. 301',
    targetNode: 'D_ROOM2',
    center: [485, 517],
    door: [485, 676.5],
    polygon: [[357.5, 284.5], [357.5, 686.5], [676.5, 686.5], [676.5, 284.5]],
  },
  {
    id: 'r3',
    name: 'No. 302',
    targetNode: 'D_ROOM3',
    center: [890, 517],
    door: [890, 676.5],
    polygon: [[356.5, 685.5], [356.5, 1094.5], [676.5, 1094.5], [676.5, 685.5]],
  },
  {
    id: 'r4',
    name: 'No. 303',
    targetNode: 'D_ROOM4',
    center: [485, 1081],
    door: [485, 921.5],
    polygon: [[921.5, 284.5], [921.5, 681.5], [1241.5, 681.5], [1241.5, 284.5]],
  },
  {
    id: 'r5',
    name: 'No. 304',
    targetNode: 'D_ROOM5',
    center: [890, 1081],
    door: [890, 921.5],
    polygon: [[921.5, 681.5], [921.5, 1094.5], [1241.5, 1094.5], [1241.5, 681.5]],
  },
  {
    id: 'r6',
    name: 'No. 305',
    targetNode: 'D_ROOM6',
    center: [689, 1449],
    door: [284.5, 1449],
    polygon: [[1234.5, 284.5], [1234.5, 1094.5], [1664.5, 1094.5], [1664.5, 284.5]],
  },
];

const buildingShell = [[7.5, 7.5], [7.5, 1094.5], [1664.5, 1094.5], [1664.5, 7.5]];
const corridorPolygon = [
  [7.5, 7.5],
  [7.5, 284.5],
  [676.5, 284.5],
  [676.5, 1094.5],
  [921.5, 1094.5],
  [921.5, 284.5],
  [1664.5, 284.5],
  [1664.5, 7.5],
];

const BUILDING_SHELL_POINTS = buildingShell.map(([y, x]) => `${x},${y}`).join(' ');
const CORRIDOR_POINTS = corridorPolygon.map(([y, x]) => `${x},${y}`).join(' ');
const ROOM_POLYGONS = rooms.reduce((acc, room) => {
  acc[room.id] = room.polygon.map(([y, x]) => `${x},${y}`).join(' ');
  return acc;
}, {});

const AUTHORIZED_BEACONS = {
  no300: { canonicalName: 'No. 300', targetNode: 'D_ROOM1' },
  room300: { canonicalName: 'No. 300', targetNode: 'D_ROOM1' },
  '300': { canonicalName: 'No. 300', targetNode: 'D_ROOM1' },
  no301: { canonicalName: 'No. 301', targetNode: 'D_ROOM2' },
  room301: { canonicalName: 'No. 301', targetNode: 'D_ROOM2' },
  '301': { canonicalName: 'No. 301', targetNode: 'D_ROOM2' },
  a01: { canonicalName: 'No. 301', targetNode: 'D_ROOM2' },
  no302: { canonicalName: 'No. 302', targetNode: 'D_ROOM3' },
  room302: { canonicalName: 'No. 302', targetNode: 'D_ROOM3' },
  '302': { canonicalName: 'No. 302', targetNode: 'D_ROOM3' },
  no303: { canonicalName: 'No. 303', targetNode: 'D_ROOM4' },
  room303: { canonicalName: 'No. 303', targetNode: 'D_ROOM4' },
  '303': { canonicalName: 'No. 303', targetNode: 'D_ROOM4' },
  no304: { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
  room304: { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
  '304': { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
  b01: { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
  no305: { canonicalName: 'No. 305', targetNode: 'D_ROOM6' },
  room305: { canonicalName: 'No. 305', targetNode: 'D_ROOM6' },
  '305': { canonicalName: 'No. 305', targetNode: 'D_ROOM6' },
};

function normalizeBeaconName(beaconName) {
  return (beaconName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validateBeacon(rawName, advertisedUuids = [], gattVerified = false) {
  const key = normalizeBeaconName(rawName);
  const entry = AUTHORIZED_BEACONS[key];
  if (!entry) {
    return { valid: false, reason: `Unauthorized device "${rawName || 'Unknown'}"` };
  }

  const hasMatchingUuid =
    gattVerified ||
    advertisedUuids.some((u) => String(u).toLowerCase() === BLE_SERVICE_UUID.toLowerCase());

  return {
    valid: true,
    key,
    canonicalName: entry.canonicalName,
    targetNode: entry.targetNode,
    authenticated: hasMatchingUuid,
  };
}

function pointForNode(nodeKey) {
  return navPointForNode(nodes, nodeKey);
}

const WALKABLE_EDGES = buildWalkableEdges(graph);
const CORRIDOR_EDGES = WALKABLE_EDGES.filter(
  ([u, v]) => !u.startsWith('D_') && !v.startsWith('D_')
);

function createNodePosition(nodeKey, source = 'manual', accuracyPx = 38) {
  const [x, y] = pointForNode(nodeKey);
  const neighbor = graph[nodeKey]?.[0] || nodeKey;
  return {
    x,
    y,
    edge: [nodeKey, neighbor],
    t: 0,
    nearestNode: nodeKey,
    accuracyPx,
    source,
  };
}

function findRoomContainingPoint(x, y) {
  for (const room of rooms) {
    const ys = room.polygon.map((p) => p[0]);
    const xs = room.polygon.map((p) => p[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      return room;
    }
  }
  return null;
}

/**
 * Heading angle in degrees (0° = Up/North, 90° = Right/East, 180° = Down/South, -90° = Left/West)
 */
function segmentBearingDeg(fromNode, toNode) {
  const [x1, y1] = pointForNode(fromNode);
  const [x2, y2] = pointForNode(toNode);
  return bearingDegBetweenPoints(x1, y1, x2, y2);
}

function App() {
  const [activeBeacons, setActiveBeacons] = useState({});
  const [livePosition, setLivePosition] = useState(() => createNodePosition('START', 'manual', 38));
  const currentLocationNode = livePosition.nearestNode;
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [customPin, setCustomPin] = useState(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'beacons'
  const [guideOpen, setGuideOpen] = useState(false);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Tap a room to navigate or connect BLE beacons.');

  // Google Maps Rotation & Person Gyroscope state
  const [headsUpMode, setHeadsUpMode] = useState(false);
  const [compassActive, setCompassActive] = useState(true);
  const [sensorEpoch, setSensorEpoch] = useState(0);
  const [manualRotation, setManualRotation] = useState(0);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  const svgRef = useRef(null);
  const userGroupRef = useRef(null);
  const userAccuracyRef = useRef(null);
  const userBeamRef = useRef(null);
  const routeCasingRef = useRef(null);
  const routeLineRef = useRef(null);
  const routeFlowRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const gestureRef = useRef({
    hasMoved: false,
    lastCenter: null,
    lastPinchDist: null,
  });

  const beaconDataRef = useRef({});
  const deviceListenersRef = useRef(new Map());
  const globalAdvListenerRef = useRef(null);
  const activeScanRef = useRef(null);
  const currentLocRef = useRef(currentLocationNode);
  const livePosRef = useRef(livePosition);
  const targetPosRef = useRef(livePosition);
  const visualPosRef = useRef({
    x: livePosition.x,
    y: livePosition.y,
    accuracyPx: livePosition.accuracyPx,
  });
  const routeTailRef = useRef([]);
  const lastTravelAlignPosRef = useRef({ x: livePosition.x, y: livePosition.y });
  const compassBaselineRef = useRef(null);
  const deviceHeadingRef = useRef(0);
  const headingAtBaselineRef = useRef(180);
  const hasGyroSampleRef = useRef(false);
  const alignedHeadingRef = useRef(null);
  const junctionLockRef = useRef(null);
  const gyroTurnCandidateRef = useRef(null);
  const headsUpModeRef = useRef(headsUpMode);

  useEffect(() => {
    currentLocRef.current = currentLocationNode;
    livePosRef.current = livePosition;
  }, [currentLocationNode, livePosition]);

  useEffect(() => {
    headsUpModeRef.current = headsUpMode;
  }, [headsUpMode]);

  const moveUserToNode = useCallback((nodeKey, source = 'manual') => {
    const nextPos = createNodePosition(nodeKey, source, 38);
    lastTravelAlignPosRef.current = { x: nextPos.x, y: nextPos.y };
    setLivePosition(nextPos);
  }, []);

  useEffect(() => {
    const deviceListeners = deviceListenersRef.current;
    return () => {
      if (activeScanRef.current?.active) {
        try {
          activeScanRef.current.stop();
        } catch {
          // Ignore scan stop errors during unmount
        }
        activeScanRef.current = null;
      }
      if (globalAdvListenerRef.current && navigator.bluetooth) {
        try {
          navigator.bluetooth.removeEventListener(
            'advertisementreceived',
            globalAdvListenerRef.current
          );
        } catch {
          // Ignore listener removal errors during unmount
        }
        globalAdvListenerRef.current = null;
      }
      deviceListeners.forEach((entry, key) => {
        try {
          if (typeof entry === 'function' && key?.removeEventListener) {
            key.removeEventListener('advertisementreceived', entry);
          } else if (entry && typeof entry === 'object') {
            if (entry.device?.removeEventListener && entry.handler) {
              entry.device.removeEventListener('advertisementreceived', entry.handler);
            }
            if (typeof entry.unwatch === 'function') entry.unwatch();
            if (typeof entry.abort === 'function') entry.abort();
          }
        } catch {
          // Ignore cleanup errors during unmount
        }
      });
      deviceListeners.clear();
    };
  }, []);

  const autoHidePanelOnMapTouch = useCallback(() => {
    if (window.innerWidth < 900) {
      setPanelOpen(false);
    }
  }, []);

  const handleMobileReload = useCallback(async () => {
    if (isReloading) return;
    setIsReloading(true);
    try {
      if (navigator.onLine && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await Promise.race([
            (async () => {
              await reg.update().catch(() => {});
              const candidate = reg.waiting || reg.installing;
              if (candidate) {
                await new Promise((done) => {
                  const activateWaiting = () => {
                    if (reg.waiting) {
                      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                  };
                  navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
                  candidate.addEventListener('statechange', () => {
                    if (candidate.state === 'installed') activateWaiting();
                  });
                  activateWaiting();
                });
              }
            })(),
            new Promise((resolve) => setTimeout(resolve, 2500)),
          ]);
        }
      }
    } catch {
      // Proceed with reload even if service worker check fails
    }
    window.location.reload();
  }, [isReloading]);

  const selectedRoom = useMemo(
    () => rooms.find((item) => item.id === selectedRoomId) || null,
    [selectedRoomId]
  );

  const activeDestination = useMemo(() => {
    if (selectedRoom) {
      return {
        kind: 'room',
        id: selectedRoom.id,
        name: selectedRoom.name,
        targetNode: selectedRoom.targetNode,
        point: pointForNode(selectedRoom.targetNode),
      };
    }
    if (customPin) {
      return {
        kind: 'pin',
        id: 'custom-pin',
        name: customPin.name,
        targetNode: customPin.nearestNode,
        x: customPin.x,
        y: customPin.y,
        edge: customPin.edge,
        point: [customPin.x, customPin.y],
      };
    }
    return null;
  }, [selectedRoom, customPin]);

  const routeData = useMemo(() => {
    if (!activeDestination) {
      return { points: [], remainingNodes: [], distancePx: 0, distanceMeters: 0, seconds: 0 };
    }
    return computeLiveRouteFromPosition({
      nodes,
      graph,
      userPos: livePosition,
      destNode: activeDestination.targetNode,
      destPos: activeDestination.kind === 'pin' ? activeDestination : null,
    });
  }, [livePosition, activeDestination]);

  const routePoints = routeData.points;
  const pathNodes = routeData.remainingNodes;

  useEffect(() => {
    routeTailRef.current = routeData.points.slice(1);
  }, [routeData.points]);

  // Smooth 60 FPS visual glide for Google Maps dot + accuracy halo + trimmed live route start
  useEffect(() => {
    targetPosRef.current = livePosition;
    let rafId = null;
    const gain = livePosition.source === 'manual' ? 0.34 : 0.22;

    const glideFrame = () => {
      rafId = null;
      const target = targetPosRef.current;
      const cur = visualPosRef.current;
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const dr = target.accuracyPx - cur.accuracyPx;

      if (Math.hypot(dx, dy) < 0.4 && Math.abs(dr) < 0.5) {
        cur.x = target.x;
        cur.y = target.y;
        cur.accuracyPx = target.accuracyPx;
      } else {
        cur.x += dx * gain;
        cur.y += dy * gain;
        cur.accuracyPx += dr * gain;
        rafId = requestAnimationFrame(glideFrame);
      }

      const vx = Math.round(cur.x * 10) / 10;
      const vy = Math.round(cur.y * 10) / 10;
      const vr = Math.round(cur.accuracyPx);

      userGroupRef.current?.setAttribute('transform', `translate(${vx}, ${vy})`);
      userAccuracyRef.current?.setAttribute('r', `${vr}`);

      if (routeTailRef.current.length > 0) {
        const ptsAttr = [[vx, vy], ...routeTailRef.current]
          .map(([px, py]) => `${Math.round(px * 10) / 10},${Math.round(py * 10) / 10}`)
          .join(' ');
        routeCasingRef.current?.setAttribute('points', ptsAttr);
        routeLineRef.current?.setAttribute('points', ptsAttr);
        routeFlowRef.current?.setAttribute('points', ptsAttr);
      }
    };

    rafId = requestAnimationFrame(glideFrame);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [livePosition]);

  const guidance = useMemo(
    () =>
      computeRealtimeGuidance({
        routeData,
        destinationRoom: activeDestination,
        nodeLabels: NODE_LABELS,
        userNearestNode: livePosition.nearestNode,
      }),
    [routeData, activeDestination, livePosition.nearestNode]
  );

  // Default user facing direction when compass/gyroscope hasn't calibrated yet
  const defaultFacingDeg = useMemo(() => {
    if (guidance && !guidance.arrived) {
      return guidance.headingDeg;
    }
    if (livePosition.edge && livePosition.edge[0] !== livePosition.edge[1]) {
      const [u, v] = livePosition.edge;
      if (currentLocationNode.startsWith('D_') && graph[currentLocationNode]?.[0]) {
        return segmentBearingDeg(currentLocationNode, graph[currentLocationNode][0]);
      }
      const forwardNode = currentLocationNode === u ? v : u;
      return segmentBearingDeg(currentLocationNode, forwardNode);
    }
    return 180;
  }, [currentLocationNode, guidance, livePosition.edge]);

  // Initial/re-rendered person beam angle (between renders, rAF rotates userBeamRef directly at 60 FPS)
  const initialUserHeadingDeg = compassActive
    ? Math.round((headingAtBaselineRef.current + deviceHeadingRef.current) * 10) / 10
    : defaultFacingDeg;

  // Before the first gyroscope sample arrives (or while compass is off), keep beam aligned with route/door direction
  useEffect(() => {
    if (!hasGyroSampleRef.current || !compassActive) {
      headingAtBaselineRef.current = defaultFacingDeg;
      deviceHeadingRef.current = 0;
      userBeamRef.current?.setAttribute(
        'transform',
        `rotate(${Math.round(defaultFacingDeg * 10) / 10})`
      );
    }
  }, [defaultFacingDeg, compassActive]);

  const [mapToast, setMapToast] = useState('');
  const hasMountedStatusRef = useRef(false);

  useEffect(() => {
    if (!hasMountedStatusRef.current) {
      hasMountedStatusRef.current = true;
      return;
    }
    if (!statusMessage || panelOpen || window.innerWidth >= 900) {
      setMapToast('');
      return;
    }
    setMapToast(statusMessage);
    const timer = setTimeout(() => setMapToast(''), 4200);
    return () => clearTimeout(timer);
  }, [statusMessage, panelOpen]);

  // Map stays steady along straight corridors and while turning on the spot; it rotates at start
  // and when reaching/turning at an actual route turn or junction (headsUpMode).
  const unwrappedRotationRef = useRef(0);
  const mapRotationDeg = useMemo(() => {
    const prev = unwrappedRotationRef.current;
    const next = prev + normalizeDeltaDeg(manualRotation - prev);
    unwrappedRotationRef.current = next;
    return next;
  }, [manualRotation]);

  useEffect(() => {
    if (!headsUpMode || !activeDestination || guidance?.arrived || routeData.points.length < 2) {
      gyroTurnCandidateRef.current = null;
      if (!headsUpMode || !activeDestination) {
        alignedHeadingRef.current = null;
        junctionLockRef.current = null;
      }
      return;
    }

    const liveSvgHeading =
      hasGyroSampleRef.current && compassActive
        ? headingAtBaselineRef.current + deviceHeadingRef.current
        : null;

    const res = resolveRouteJunctionHeading({
      routePoints: routeData.points,
      alignedHeadingDeg: alignedHeadingRef.current,
      liveHeadingDeg: liveSvgHeading,
      junctionState: junctionLockRef.current,
    });

    junctionLockRef.current = res.junctionState;
    gyroTurnCandidateRef.current = res.gyroTurnCandidate;

    if (
      res.targetHeadingDeg !== null &&
      (alignedHeadingRef.current === null ||
        Math.abs(normalizeDeltaDeg(res.targetHeadingDeg - alignedHeadingRef.current)) >= 1)
    ) {
      alignedHeadingRef.current = res.targetHeadingDeg;
      setManualRotation(-res.targetHeadingDeg);
    }
  }, [routeData.points, activeDestination, headsUpMode, compassActive, guidance?.arrived]);

  // Live phone gyroscope -> rotates ONLY the blue person dot's directional beam directly via SVG transform
  useEffect(() => {
    if (!compassActive) return undefined;

    let lockedSource = null; // Prefer 'relative' IMU gyro; fall back to 'absolute' only if unavailable
    let allowAbsoluteFallback = false;
    let lastRawHeading = null;
    let unwrappedHeading = null;
    let smoothed = null;
    let lastEventTs = 0;
    let rafId = null;

    const fallbackTimer = setTimeout(() => {
      if (!lockedSource) {
        allowAbsoluteFallback = true;
      }
    }, 350);

    const screenAngle = () => {
      const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
      return Number(angle) || 0;
    };

    const applyBeamAngle = (angleDeg) => {
      const rounded = Math.round(angleDeg * 10) / 10;
      userBeamRef.current?.setAttribute('transform', `rotate(${rounded})`);
    };

    const tick = () => {
      rafId = null;
      if (unwrappedHeading === null) return;

      if (compassBaselineRef.current === null) {
        smoothed = unwrappedHeading;
        compassBaselineRef.current = unwrappedHeading;
        hasGyroSampleRef.current = true;
      } else if (smoothed === null) {
        smoothed = unwrappedHeading;
      }

      const diff = unwrappedHeading - smoothed;
      if (Math.abs(diff) > 0.35) {
        const gain = Math.abs(diff) > 15 ? 0.32 : 0.24;
        smoothed += diff * gain;
      } else {
        smoothed = unwrappedHeading;
      }

      const relative = smoothed - compassBaselineRef.current;
      deviceHeadingRef.current = relative;
      const liveSvgHeading = headingAtBaselineRef.current + relative;
      applyBeamAngle(liveSvgHeading);

      const cand = gyroTurnCandidateRef.current;
      if (headsUpModeRef.current && cand) {
        const distNext = Math.abs(normalizeDeltaDeg(liveSvgHeading - cand.nextBearing));
        const distCur = Math.abs(normalizeDeltaDeg(liveSvgHeading - cand.curBearing));
        if (distNext <= 38 && distNext + 12 < distCur) {
          gyroTurnCandidateRef.current = null;
          alignedHeadingRef.current = cand.nextBearing;
          junctionLockRef.current = {
            cornerX: cand.cornerX,
            cornerY: cand.cornerY,
            headingDeg: cand.nextBearing,
          };
          setManualRotation(-cand.nextBearing);
        }
      }

      if (Math.abs(unwrappedHeading - smoothed) > 0.25) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const processOrientationEvent = (event, sourceType) => {
      if (lockedSource && lockedSource !== sourceType) return;
      if (
        sourceType === 'absolute' &&
        !allowAbsoluteFallback &&
        lockedSource !== 'absolute'
      ) {
        return;
      }

      const heading = extractPhoneHeadingDeg(event, screenAngle());
      if (heading === null || !Number.isFinite(heading)) return;

      if (!lockedSource) {
        lockedSource = sourceType;
      }

      const nowTs = performance.now();
      const dtSec = lastEventTs ? Math.max(0.008, (nowTs - lastEventTs) / 1000) : 0.02;
      lastEventTs = nowTs;

      if (lastRawHeading !== null) {
        const rawDelta = normalizeDeltaDeg(heading - lastRawHeading);
        // Reject impossible instantaneous >105 deg glitches within <40ms
        if (Math.abs(rawDelta) > 105 && dtSec < 0.04) {
          return;
        }
        const maxStep = Math.max(45, Math.min(90, dtSec * 420));
        const clampedDelta = Math.max(-maxStep, Math.min(maxStep, rawDelta));
        unwrappedHeading += clampedDelta;
      } else {
        unwrappedHeading = heading;
      }
      lastRawHeading = heading;

      if (rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onRelativeOrientation = (e) => processOrientationEvent(e, 'relative');
    const onAbsoluteOrientation = (e) => processOrientationEvent(e, 'absolute');

    window.addEventListener('deviceorientation', onRelativeOrientation, true);
    window.addEventListener('deviceorientationabsolute', onAbsoluteOrientation, true);

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('deviceorientation', onRelativeOrientation, true);
      window.removeEventListener('deviceorientationabsolute', onAbsoluteOrientation, true);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [compassActive, sensorEpoch]);

  const toggleCompassAndRotation = async () => {
    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') {
          setCompassActive(true);
          setSensorEpoch((prev) => prev + 1);
        }
      }
    } catch {
      // Ignore on browsers that don't require explicit permission
    }

    setCompassActive(true);
    compassBaselineRef.current = null;
    deviceHeadingRef.current = 0;

    if (!headsUpMode && guidance && !guidance.arrived) {
      alignRouteOnce(routeData);
      setStatusMessage('Map aligned to route & turns. Person indicator tracks your phone direction.');
    } else {
      headingAtBaselineRef.current = defaultFacingDeg;
      alignedHeadingRef.current = null;
      junctionLockRef.current = null;
      gyroTurnCandidateRef.current = null;
      setHeadsUpMode(false);
      setManualRotation(0);
      userBeamRef.current?.setAttribute(
        'transform',
        `rotate(${Math.round(defaultFacingDeg * 10) / 10})`
      );
      setStatusMessage('Map set to North-Up (0°). Person indicator calibrated.');
    }
  };

  const refreshLocationFromBeacons = useCallback(() => {
    const now = Date.now();
    const knownList = Object.values(beaconDataRef.current).filter((b) => b.valid);
    const liveList = knownList.filter((b) => now - b.lastSeen < BEACON_TIMEOUT_MS);

    const nextState = {};
    knownList.forEach((b) => {
      nextState[b.canonicalName] = {
        ...b,
        ageSeconds: Math.max(0, Math.round((now - b.lastSeen) / 1000)),
        isLive: now - b.lastSeen < BEACON_TIMEOUT_MS,
      };
    });
    setActiveBeacons(nextState);

    if (liveList.length === 0) {
      if (knownList.length > 0) {
        setStatusMessage('No live beacon signal. Keeping last estimated location.');
      }
      return;
    }

    const qualifiedList = liveList.filter((b) => b.sampleCount >= MIN_RSSI_SAMPLES);
    if (qualifiedList.length === 0) return;

    const solved = solveRealtimeBeaconPosition({
      liveBeacons: qualifiedList,
      nodes,
      graph,
      edges: WALKABLE_EDGES,
      prevPos: livePosRef.current,
    });
    if (!solved) return;

    // Gentle Google Maps course-over-ground fusion when real BLE walking spans > 1.2m
    const lastAnchor = lastTravelAlignPosRef.current;
    const travelDist = Math.hypot(solved.x - lastAnchor.x, solved.y - lastAnchor.y);
    if (livePosRef.current.source === 'ble' && travelDist >= 52) {
      const travelBearing = bearingDegBetweenPoints(
        lastAnchor.x,
        lastAnchor.y,
        solved.x,
        solved.y
      );
      lastTravelAlignPosRef.current = { x: solved.x, y: solved.y };
      if (!hasGyroSampleRef.current) {
        headingAtBaselineRef.current = travelBearing;
        userBeamRef.current?.setAttribute(
          'transform',
          `rotate(${Math.round(travelBearing * 10) / 10})`
        );
      }
    } else if (livePosRef.current.source !== 'ble') {
      lastTravelAlignPosRef.current = { x: solved.x, y: solved.y };
    }

    const cur = livePosRef.current;
    const movedPx = Math.hypot(solved.x - cur.x, solved.y - cur.y);
    if (
      cur.source !== 'ble' ||
      movedPx >= 3 ||
      solved.nearestNode !== cur.nearestNode ||
      Math.abs(solved.accuracyPx - cur.accuracyPx) >= 3
    ) {
      setLivePosition(solved);
    }

    const sortedByDist = [...qualifiedList].sort((a, b) => a.distanceMeters - b.distanceMeters);
    const closest = sortedByDist[0];
    const second = sortedByDist[1];
    if (second) {
      setStatusMessage(
        `Live BLE (${sortedByDist.length}): ${closest.canonicalName} (~${closest.distanceMeters.toFixed(1)} m), ${second.canonicalName} (~${second.distanceMeters.toFixed(1)} m) → ${NODE_LABELS[solved.nearestNode]}`
      );
    } else {
      const authLabel = closest.authenticated ? 'UUID' : 'Valid';
      setStatusMessage(
        `Tracking ${closest.canonicalName} (~${closest.distanceMeters.toFixed(1)} m • ${Math.round(closest.smoothedRssi)} dBm • ${authLabel}) → ${NODE_LABELS[solved.nearestNode]}`
      );
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (Object.keys(beaconDataRef.current).length > 0) {
        refreshLocationFromBeacons();
      }
    }, 500);
    return () => clearInterval(timer);
  }, [refreshLocationFromBeacons]);

  const recordBeaconReading = useCallback(
    (deviceId, rawName, rawRssi, uuids = []) => {
      const validation = validateBeacon(rawName, uuids, false);
      if (!validation.valid) {
        return false;
      }

      if (typeof rawRssi !== 'number' || Number.isNaN(rawRssi)) {
        return false;
      }

      const slotKey = validation.canonicalName;
      const existing = beaconDataRef.current[slotKey];
      const now = Date.now();
      const hasRecentReading = existing && now - existing.lastSeen < BEACON_TIMEOUT_MS;
      const recentSamples = hasRecentReading ? existing.samples : [];
      const addSample =
        !hasRecentReading ||
        now - (existing.lastSampledAt || 0) >= RSSI_SAMPLE_INTERVAL_MS;
      const samples = addSample
        ? [...recentSamples, rawRssi].slice(-RSSI_SAMPLE_WINDOW)
        : recentSamples;

      const kalman = addSample
        ? kalmanUpdateRssi(
            hasRecentReading ? existing.kalmanRssi : null,
            hasRecentReading ? existing.kalmanCov : null,
            rawRssi
          )
        : { rssi: existing.kalmanRssi, covariance: existing.kalmanCov };

      const distanceMeters = rssiToDistanceMeters(kalman.rssi);

      beaconDataRef.current[slotKey] = {
        id: deviceId || slotKey,
        key: slotKey,
        name: validation.canonicalName,
        canonicalName: validation.canonicalName,
        targetNode: validation.targetNode,
        rssi: rawRssi,
        kalmanRssi: kalman.rssi,
        kalmanCov: kalman.covariance,
        smoothedRssi: kalman.rssi,
        distanceMeters,
        samples,
        sampleCount: samples.length,
        lastSampledAt: addSample ? now : existing.lastSampledAt,
        valid: true,
        authenticated: Boolean(existing?.authenticated || validation.authenticated),
        lastSeen: now,
      };

      refreshLocationFromBeacons();
      return true;
    },
    [refreshLocationFromBeacons]
  );

  const watchSingleDevice = useCallback(
    async (device, fallbackName = '') => {
      const prevHandler = deviceListenersRef.current.get(device.id);
      if (prevHandler) {
        device.removeEventListener('advertisementreceived', prevHandler);
      }

      const onAdvertisement = (event) => {
        const advName = device.name || event.name || fallbackName;
        const advUuids = event.uuids || [];
        recordBeaconReading(device.id, advName, event.rssi, advUuids);
      };

      device.addEventListener('advertisementreceived', onAdvertisement);
      deviceListenersRef.current.set(device.id, onAdvertisement);

      if (typeof device.watchAdvertisements === 'function' && !device.watchingAdvertisements) {
        try {
          await device.watchAdvertisements();
        } catch {
          // Safely ignore if watchAdvertisements is already active or experimental flag is disabled
        }
      }
    },
    [recordBeaconReading]
  );

  const startAdvertisementScan = useCallback(async () => {
    if (!navigator.bluetooth) {
      return {
        started: false,
        message: 'Web Bluetooth is not available in this browser. Use Chrome or Edge.',
      };
    }

    if (typeof navigator.bluetooth.requestLEScan !== 'function') {
      return {
        started: false,
        message: 'Simultaneous BLE scanning is not supported here. Use Add Beacon for each device.',
      };
    }

    if (activeScanRef.current?.active) {
      return { started: true, message: 'Simultaneous BLE scan is already active.' };
    }

    try {
      if (!globalAdvListenerRef.current) {
        const onGlobalAdv = (event) => {
          const rawName = event.device?.name || event.name || '';
          const advUuids = event.uuids || [];
          recordBeaconReading(event.device?.id, rawName, event.rssi, advUuids);
        };
        navigator.bluetooth.addEventListener('advertisementreceived', onGlobalAdv);
        globalAdvListenerRef.current = onGlobalAdv;
      }

      activeScanRef.current = await navigator.bluetooth.requestLEScan({
        filters: BEACON_FILTERS,
        keepRepeatedDevices: true,
      });
      setIsScanningAll(true);
      return { started: true, message: 'Scanning nearby beacons together.' };
    } catch (error) {
      return {
        started: false,
        message: `Could not start simultaneous BLE scan: ${error?.message || 'Unknown error'}.`,
      };
    }
  }, [recordBeaconReading]);

  useEffect(() => {
    let mounted = true;
    async function restoreSavedBeacons() {
      if (!navigator.bluetooth || typeof navigator.bluetooth.getDevices !== 'function') {
        return;
      }
      try {
        const savedDevices = await navigator.bluetooth.getDevices();
        if (!mounted || !savedDevices.length) return;

        let restoredCount = 0;
        for (const device of savedDevices) {
          const check = validateBeacon(device.name || '');
          if (check.valid) {
            await watchSingleDevice(device, check.canonicalName);
            restoredCount += 1;
          }
        }
        if (restoredCount > 0 && mounted) {
          setStatusMessage(`Auto-watching ${restoredCount} saved beacon(s).`);
        }
      } catch {
        // Ignore if permission backend flag is not enabled
      }
    }
    restoreSavedBeacons();
    return () => {
      mounted = false;
    };
  }, [watchSingleDevice]);

  const connectBeacon = async () => {
    try {
      if (!navigator.bluetooth) {
        setStatusMessage('Web Bluetooth is not available in this browser. Use Chrome or Edge on HTTPS.');
        setActiveTab('beacons');
        if (window.innerWidth < 900) {
          setPanelOpen(true);
        }
        return;
      }

      const device = await navigator.bluetooth.requestDevice({
        filters: BEACON_FILTERS,
        optionalServices: [BLE_SERVICE_UUID],
      });

      const resolvedName = device.name || '';
      const initialValidation = validateBeacon(resolvedName, [], false);
      if (!initialValidation.valid) {
        setStatusMessage(`Ignored: ${initialValidation.reason}`);
        return;
      }

      const canWatchDevice = typeof device.watchAdvertisements === 'function';
      if (typeof device.watchAdvertisements === 'function') {
        await watchSingleDevice(device, initialValidation.canonicalName);
      }

      const scanResult = await startAdvertisementScan();
      if (scanResult.started) {
        setStatusMessage(
          `${scanResult.message} Location follows the nearest stable signal.`
        );
      } else if (canWatchDevice) {
        const scanHelp =
          typeof navigator.bluetooth.requestLEScan === 'function'
            ? 'If other beacons stop updating, start Scan Nearby.'
            : 'This browser cannot monitor multiple beacons with a shared scan.';
        setStatusMessage(
          `Watching ${initialValidation.canonicalName}. ${scanResult.message} ${scanHelp}`
        );
      } else {
        currentLocRef.current = initialValidation.targetNode;
        moveUserToNode(initialValidation.targetNode, 'manual');
        setStatusMessage(
          `You are in ${initialValidation.canonicalName}, but live BLE tracking is unavailable. ${scanResult.message}`
        );
      }
    } catch (error) {
      if (error?.name === 'NotFoundError') {
        setStatusMessage('Beacon selection cancelled.');
      } else {
        setStatusMessage(`Could not connect to beacon: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const startAutoScanBeacons = async () => {
    if (!navigator.bluetooth) {
      setStatusMessage('Web Bluetooth is not available in this browser. Use Chrome or Edge on HTTPS.');
      setActiveTab('beacons');
      if (window.innerWidth < 900) {
        setPanelOpen(true);
      }
      return;
    }

    if (activeScanRef.current?.active) {
      activeScanRef.current.stop();
      activeScanRef.current = null;
      setIsScanningAll(false);
      setStatusMessage('Auto-scan stopped.');
      return;
    }

    const scanResult = await startAdvertisementScan();
    setStatusMessage(
      scanResult.started
        ? `${scanResult.message} Location follows the nearest stable signal.`
        : `${scanResult.message} Use Add Beacon to select devices individually.`
    );
  };

  const routeMetrics = useMemo(
    () => ({
      distancePixels: routeData.distancePx,
      distanceMeters: routeData.distanceMeters,
      seconds: routeData.seconds,
    }),
    [routeData]
  );

  const visibleRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.name.toLowerCase().includes(q));
  }, [roomSearch]);

  const debugBeacons = useMemo(
    () =>
      Object.values(activeBeacons).sort(
        (a, b) => Number(b.isLive) - Number(a.isLive) || b.smoothedRssi - a.smoothedRssi
      ),
    [activeBeacons]
  );
  const liveBeaconCount = debugBeacons.filter((beacon) => beacon.isLive).length;

  const resetMapView = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    compassBaselineRef.current = null;
    deviceHeadingRef.current = 0;
    headingAtBaselineRef.current = defaultFacingDeg;
    alignedHeadingRef.current = null;
    junctionLockRef.current = null;
    gyroTurnCandidateRef.current = null;
    setHeadsUpMode(false);
    setManualRotation(0);
    userBeamRef.current?.setAttribute(
      'transform',
      `rotate(${Math.round(defaultFacingDeg * 10) / 10})`
    );
  }, [defaultFacingDeg]);

  const zoomBy = useCallback((deltaFactor) => {
    setTransform((prev) => {
      const nextScale = Math.min(3.2, Math.max(0.85, Number((prev.scale * deltaFactor).toFixed(2))));
      if (nextScale === 1) return { scale: 1, x: 0, y: 0 };
      return { ...prev, scale: nextScale };
    });
  }, []);

  const alignRouteOnce = useCallback((nextRoute) => {
    if (nextRoute.points.length >= 2) {
      const res = resolveRouteJunctionHeading({
        routePoints: nextRoute.points,
        alignedHeadingDeg: null,
      });
      const pathDirectionDeg =
        res.targetHeadingDeg ??
        bearingDegBetweenPoints(
          nextRoute.points[0][0],
          nextRoute.points[0][1],
          nextRoute.points[1][0],
          nextRoute.points[1][1]
        );
      alignedHeadingRef.current = pathDirectionDeg;
      junctionLockRef.current = res.junctionState;
      gyroTurnCandidateRef.current = res.gyroTurnCandidate;
      setHeadsUpMode(true);
      setManualRotation(-pathDirectionDeg);
      compassBaselineRef.current = null;
      deviceHeadingRef.current = 0;
      headingAtBaselineRef.current = pathDirectionDeg;
      userBeamRef.current?.setAttribute('transform', `rotate(${Math.round(pathDirectionDeg * 10) / 10})`);
    } else {
      alignedHeadingRef.current = null;
      junctionLockRef.current = null;
      gyroTurnCandidateRef.current = null;
      setHeadsUpMode(false);
      setManualRotation(0);
    }
  }, []);

  const navigateToRoom = useCallback(
    (room, hidePanel = false) => {
      setCustomPin(null);
      setSelectedRoomId(room.id);

      // Rotate the map ONCE to align with the initial direction of the live path, then keep the map still
      // while the person dot's directional cone rotates with the phone's gyroscope.
      const nextRoute = computeLiveRouteFromPosition({
        nodes,
        graph,
        userPos: livePosRef.current,
        destNode: room.targetNode,
      });
      alignRouteOnce(nextRoute);

      setStatusMessage(`Pinned destination: ${room.name}.`);
      if (hidePanel && window.innerWidth < 900) {
        setPanelOpen(false);
      }
    },
    [alignRouteOnce]
  );

  const navigateToPin = useCallback(
    (pin, hidePanel = false) => {
      setSelectedRoomId(null);
      setCustomPin(pin);

      const nextRoute = computeLiveRouteFromPosition({
        nodes,
        graph,
        userPos: livePosRef.current,
        destNode: pin.nearestNode,
        destPos: pin,
      });
      alignRouteOnce(nextRoute);

      setStatusMessage(`Pinned destination: ${pin.name}.`);
      if (hidePanel && window.innerWidth < 900) {
        setPanelOpen(false);
      }
    },
    [alignRouteOnce]
  );

  const clearNavigation = useCallback(() => {
    setSelectedRoomId(null);
    setCustomPin(null);
    alignedHeadingRef.current = null;
    junctionLockRef.current = null;
    gyroTurnCandidateRef.current = null;
    setHeadsUpMode(false);
    setManualRotation(0);
    compassBaselineRef.current = null;
    deviceHeadingRef.current = 0;
    const idleDeg =
      currentLocRef.current.startsWith('D_') && graph[currentLocRef.current]?.[0]
        ? segmentBearingDeg(currentLocRef.current, graph[currentLocRef.current][0])
        : 180;
    headingAtBaselineRef.current = idleDeg;
    userBeamRef.current?.setAttribute('transform', `rotate(${Math.round(idleDeg * 10) / 10})`);
    setStatusMessage('Navigation cleared.');
  }, []);

  // Unified Pointer Events for 1-finger pan, 2-finger pinch zoom & 2-finger twist rotation
  const handlePointerDown = (e) => {
    autoHidePanelOnMapTouch();
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(activePointersRef.current.values());

    if (pts.length === 1) {
      gestureRef.current.hasMoved = false;
      gestureRef.current.lastCenter = { x: pts[0].x, y: pts[0].y };
      gestureRef.current.lastPinchDist = null;
    } else if (pts.length === 2) {
      gestureRef.current.hasMoved = true;
      setIsGestureActive(true);
      gestureRef.current.lastCenter = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      gestureRef.current.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  const handlePointerMove = (e) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(activePointersRef.current.values());

    if (pts.length === 1 && gestureRef.current.lastCenter) {
      const dx = pts[0].x - gestureRef.current.lastCenter.x;
      const dy = pts[0].y - gestureRef.current.lastCenter.y;

      if (!gestureRef.current.hasMoved && Math.hypot(dx, dy) > 6) {
        gestureRef.current.hasMoved = true;
        setIsGestureActive(true);
      }

      if (gestureRef.current.hasMoved) {
        gestureRef.current.lastCenter = { x: pts[0].x, y: pts[0].y };
        setTransform((prev) => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy,
        }));
      }
    } else if (pts.length === 2) {
      const center = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

      if (gestureRef.current.lastPinchDist && gestureRef.current.lastPinchDist > 0) {
        const ratio = dist / gestureRef.current.lastPinchDist;
        const dx = gestureRef.current.lastCenter ? center.x - gestureRef.current.lastCenter.x : 0;
        const dy = gestureRef.current.lastCenter ? center.y - gestureRef.current.lastCenter.y : 0;

        setTransform((prev) => ({
          scale: Math.min(3.2, Math.max(0.85, prev.scale * ratio)),
          x: prev.x + dx,
          y: prev.y + dy,
        }));
      }

      gestureRef.current.lastCenter = center;
      gestureRef.current.lastPinchDist = dist;
    }
  };

  const handlePointerUpOrCancel = (e) => {
    activePointersRef.current.delete(e.pointerId);
    const pts = Array.from(activePointersRef.current.values());
    if (pts.length === 1) {
      gestureRef.current.lastCenter = { x: pts[0].x, y: pts[0].y };
      gestureRef.current.lastPinchDist = null;
    } else if (pts.length === 0) {
      gestureRef.current.lastCenter = null;
      gestureRef.current.lastPinchDist = null;
      setIsGestureActive(false);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    zoomBy(factor);
  };

  const handleHallwayClick = (event) => {
    autoHidePanelOnMapTouch();
    if (gestureRef.current.hasMoved) return;
    const svg = svgRef.current;
    if (!svg) return;

    let x = 0;
    let y = 0;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      x = transformed.x;
      y = transformed.y;
    } else {
      const rect = svg.getBoundingClientRect();
      x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
      y = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
    }

    // Tapping a room polygon pins it as your destination (never moves the user's tracked location)
    const clickedRoom = findRoomContainingPoint(x, y);
    if (clickedRoom) {
      navigateToRoom(clickedRoom, true);
      return;
    }

    // Tapping any corridor / entrance spot drops a destination pin along the walkway
    const snapped = snapPointToEdges(x, y, nodes, CORRIDOR_EDGES);
    const [startX, startY] = pointForNode('START');
    const nearEntrance =
      snapped.nearestNode === 'START' && Math.hypot(snapped.x - startX, snapped.y - startY) < 85;
    const pinName = nearEntrance
      ? 'Main Entrance'
      : `Corridor (${NODE_LABELS[snapped.nearestNode] || snapped.nearestNode})`;

    navigateToPin(
      {
        name: pinName,
        x: nearEntrance ? startX : snapped.x,
        y: nearEntrance ? startY : snapped.y,
        edge: snapped.edge,
        nearestNode: snapped.nearestNode,
      },
      true
    );
  };

  const handleRoomPolygonClick = (event, room) => {
    event.stopPropagation();
    autoHidePanelOnMapTouch();
    if (gestureRef.current.hasMoved) return;
    navigateToRoom(room, true);
  };

  const userPoint = [
    Math.round(visualPosRef.current.x * 10) / 10,
    Math.round(visualPosRef.current.y * 10) / 10,
  ];
  const visualAccuracyPx = Math.round(visualPosRef.current.accuracyPx);
  const renderedRoutePoints =
    routePoints.length > 1 ? [userPoint, ...routePoints.slice(1)] : [];
  const renderedRouteStr = renderedRoutePoints.map(([rx, ry]) => `${rx},${ry}`).join(' ');
  const destPoint = activeDestination ? activeDestination.point : null;
  const counterRotation = -mapRotationDeg;

  return (
    <div className={`nav-app ${panelOpen ? 'sidebar-is-open' : 'sidebar-is-hidden'}`}>
      {/* FULL-SCREEN INTERACTIVE & ROTATABLE FLOOR PLAN */}
      <main
        className={`map-viewport ${panelOpen ? 'panel-is-open' : 'panel-is-hidden'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        onWheel={handleWheel}
      >
        <div
          className={`map-stage ${isGestureActive ? 'is-dragging' : ''}`}
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale}) rotate(${mapRotationDeg}deg)`,
          }}
        >
          <svg
            ref={svgRef}
            className="floorplan-svg"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            role="img"
            aria-label="Indoor floor plan"
            onClick={handleHallwayClick}
          >
            <defs>
              <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#38bdf8" floodOpacity="0.45" />
              </filter>
              <radialGradient id="beamGrad" cx="50%" cy="100%" r="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.78" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
              </radialGradient>
            </defs>

            <polygon points={BUILDING_SHELL_POINTS} className="fp-shell" />
            <polygon
              points={CORRIDOR_POINTS}
              className="fp-corridor"
              onClick={handleHallwayClick}
            />

            {/* Entrance Indicator on No. 300 Side (Counter-rotates to stay readable) */}
            <g
              transform={`translate(${nodes.START[1]}, ${nodes.START[0]}) rotate(${counterRotation})`}
              className="fp-entrance-tag"
            >
              <rect x="-58" y="-42" width="116" height="28" rx="8" className="fp-entrance-pill" />
              <text x="0" y="-23" textAnchor="middle" className="fp-entrance-text">
                ENTRANCE
              </text>
            </g>

            {/* Walkable Graph Guide Nodes */}
            {Object.entries(nodes).map(([key, [ny, nx]]) => (
              <circle
                key={key}
                cx={nx}
                cy={ny}
                r={key.startsWith('D_') ? 5 : 6}
                className="fp-nav-node"
              />
            ))}

            {rooms.map((room) => {
              const isSelected = selectedRoomId === room.id;
              const isUserHere = currentLocationNode === room.targetNode;
              const isBeaconLive = Boolean(activeBeacons[room.name]?.isLive);
              const [cx, cy] = room.center;
              const doorPt = room.door;

              return (
                <g
                  key={room.id}
                  className={`fp-room-group ${isSelected ? 'is-selected' : ''} ${
                    isUserHere ? 'is-current' : ''
                  }`}
                  onClick={(e) => handleRoomPolygonClick(e, room)}
                >
                  <polygon points={ROOM_POLYGONS[room.id]} className="fp-room-poly" />
                  <circle cx={doorPt[0]} cy={doorPt[1]} r="9" className="fp-door-dot" />
                  {/* Room Labels Counter-Rotate so text is always upright like Google Maps */}
                  <g transform={`translate(${cx}, ${cy}) rotate(${counterRotation})`}>
                    <text x="0" y="-56" textAnchor="middle" dominantBaseline="middle" className="fp-room-title">
                      {room.name}
                    </text>
                    {isUserHere && (
                      <text x="0" y="54" textAnchor="middle" className="fp-room-here-tag">
                        ● YOU ARE IN {room.name.toUpperCase()}
                      </text>
                    )}
                    {isBeaconLive && (
                      <text x="0" y={isUserHere ? '84' : '54'} textAnchor="middle" className="fp-room-beacon-tag">
                        ● BLE ({Math.round(activeBeacons[room.name].smoothedRssi)} dBm)
                      </text>
                    )}
                  </g>
                </g>
              );
            })}

            <line x1="1094.5" y1="665" x2="1094.5" y2="794" className="fp-wall-stub" />

            {renderedRoutePoints.length > 1 && (
              <g className="fp-route-group">
                <polyline
                  ref={routeCasingRef}
                  points={renderedRouteStr}
                  className="fp-route-casing"
                />
                <polyline
                  ref={routeLineRef}
                  points={renderedRouteStr}
                  className="fp-route-line"
                  filter="url(#glowFilter)"
                />
                <polyline
                  ref={routeFlowRef}
                  points={renderedRouteStr}
                  className="fp-route-flow"
                />
              </g>
            )}

            {/* Red Destination Teardrop Pin (Counter-rotates to stay upright) */}
            {destPoint && (
              <g
                transform={`translate(${destPoint[0]}, ${destPoint[1]}) rotate(${counterRotation})`}
                className="fp-dest-group"
              >
                <circle r="28" className="fp-dest-ripple" />
                <path
                  d="M0 -42 C-16 -42 -26 -30 -26 -16 C-26 4 0 28 0 28 C0 28 26 4 26 -16 C26 -30 16 -42 0 -42 Z"
                  className="fp-dest-pin"
                />
                <circle cx="0" cy="-18" r="9" fill="#ffffff" />
              </g>
            )}

            {/* Google Maps Blue User Dot + Accuracy Halo + Gyroscope-Driven Directional Heading Cone */}
            <g
              ref={userGroupRef}
              transform={`translate(${userPoint[0]}, ${userPoint[1]})`}
              className="fp-user-group"
            >
              <circle ref={userAccuracyRef} r={visualAccuracyPx} className="fp-user-accuracy" />
              <g ref={userBeamRef} transform={`rotate(${initialUserHeadingDeg})`}>
                <path d="M 0 0 L -54 -128 A 140 140 0 0 1 54 -128 Z" fill="url(#beamGrad)" />
                <path
                  d="M 0 -30 L -9 -14 L 9 -14 Z"
                  fill="#38bdf8"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
              </g>
              <circle r="34" className="fp-user-pulse" />
              <circle r="15" className="fp-user-dot" />
              <circle r="6" className="fp-user-core" />
            </g>
          </svg>
        </div>
      </main>

      {/* TOP FLOATING HUD WITH GOOGLE MAPS TURN-BY-TURN BANNER */}
      <header className="top-hud">
        <div className="hud-bar">
          <div className="brand-text">
            <span className="brand-kicker">BLE INDOOR NAVIGATION</span>
            <h1 className="brand-title">Smart Room Tracker</h1>
          </div>

          <div className="hud-bar-actions">
            <button
              type="button"
              className={`ble-pill-btn ${isScanningAll || debugBeacons.length > 0 ? 'is-live' : ''}`}
              onClick={connectBeacon}
            >
              <span className="ble-dot" />
              <span>
                {debugBeacons.length > 0
                  ? `BLE (${liveBeaconCount}) • + Add`
                  : '+ Add Beacon'}
              </span>
            </button>
            <button
              type="button"
              className={`mobile-reload-btn ${isReloading ? 'is-spinning' : ''}`}
              onClick={handleMobileReload}
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
              onClick={clearNavigation}
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
            onClick={() => setMapToast('')}
            role="status"
            aria-live="polite"
            title="Tap to dismiss"
          >
            {mapToast}
          </button>
        )}
      </header>

      {/* MAP FLOOR BADGE, COMPASS, ROTATION & ZOOM CONTROLS */}
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
          onClick={toggleCompassAndRotation}
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
          onClick={() => {
            alignedHeadingRef.current = null;
            junctionLockRef.current = null;
            gyroTurnCandidateRef.current = null;
            setHeadsUpMode(false);
            setManualRotation((prev) => (prev - 90) % 360);
          }}
          aria-label="Rotate map 90 degrees"
          title="Rotate map 90°"
        >
          ↻
        </button>
        <button type="button" className="fab-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="fab-btn" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="fab-btn" onClick={resetMapView} aria-label="Reset map view">
          ⟲
        </button>
      </div>

      {/* AUTO-HIDING BOTTOM DRAWER (MOBILE/TABLET) & COLLAPSIBLE SIDEBAR (DESKTOP) */}
      <aside
        className={`control-sheet ${panelOpen ? 'is-open' : 'is-hidden'}`}
        aria-label="Navigation panel"
      >
        <button
          type="button"
          className="pc-sidebar-edge-tab"
          onClick={() => setPanelOpen((prev) => !prev)}
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
          onClick={() => setPanelOpen((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setPanelOpen((prev) => !prev);
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
                setPanelOpen((prev) => !prev);
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
              onClick={() => setActiveTab('rooms')}
            >
              Rooms ({rooms.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'beacons'}
              className={`tab-btn ${activeTab === 'beacons' ? 'active' : ''}`}
              onClick={() => setActiveTab('beacons')}
            >
              BLE Beacons ({debugBeacons.length})
            </button>
          </div>

          <div className="sheet-content">
            {activeTab === 'rooms' && (
              <div className="tab-pane">
                <div className="active-floor-bar">
                  <span className="active-floor-label">🏢 Active Map</span>
                  <span className="active-floor-pill">3rd Floor Navigation</span>
                </div>

                {/* 1. CURRENT LOCATION SELECTOR (WHERE YOU ARE NOW) */}
                <div className="section-block">
                  <div className="section-label">📍 You Are In (Current Room / Spot):</div>
                  <div className="start-room-strip">
                    <button
                      type="button"
                      className={`start-pill ${currentLocationNode === 'START' ? 'is-active' : ''}`}
                      onClick={() => {
                        moveUserToNode('START', 'manual');
                        setStatusMessage('You are at Main Entrance.');
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
                            moveUserToNode(room.targetNode, 'manual');
                            setStatusMessage(`You are inside ${room.name}.`);
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
                      onChange={(e) => setRoomSearch(e.target.value)}
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
                          onClick={() => navigateToRoom(room, true)}
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
                      onClick={clearNavigation}
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
                      Scan to monitor No. 301 and No. 304 together. Location follows the strongest stable signal.
                    </div>
                  </div>
                  <div className="ble-btn-group">
                    <button
                      type="button"
                      className="btn-primary-sm"
                      onClick={connectBeacon}
                    >
                      + Add Beacon
                    </button>
                    <button
                      type="button"
                      className="btn-secondary-sm"
                      onClick={startAutoScanBeacons}
                    >
                      {isScanningAll ? 'Stop Scan' : 'Scan Nearby'}
                    </button>
                  </div>
                </div>

                <div className="debug-list">
                  {debugBeacons.length === 0 ? (
                    <div className="empty-ble-state">
                      <p>No active beacons detected yet.</p>
                      <small>Scan nearby beacons together, or add No. 301 and No. 304 separately.</small>
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
            onClick={() => setGuideOpen(true)}
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

      <ProjectGuide
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        bleServiceUuid={BLE_SERVICE_UUID}
        roomCount={rooms.length}
        onOpenRooms={() => {
          setGuideOpen(false);
          setActiveTab('rooms');
          setPanelOpen(true);
        }}
      />
    </div>
  );
}

export default App;
