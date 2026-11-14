import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const MAP_WIDTH = 1102;
const MAP_HEIGHT = 1672;
const BLE_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
const BEACON_TIMEOUT_MS = 15000;
const RSSI_HYSTERESIS_DBM = 3;

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
  no302: { canonicalName: 'No. 302', targetNode: 'D_ROOM3' },
  room302: { canonicalName: 'No. 302', targetNode: 'D_ROOM3' },
  '302': { canonicalName: 'No. 302', targetNode: 'D_ROOM3' },
  no303: { canonicalName: 'No. 303', targetNode: 'D_ROOM4' },
  room303: { canonicalName: 'No. 303', targetNode: 'D_ROOM4' },
  '303': { canonicalName: 'No. 303', targetNode: 'D_ROOM4' },
  no304: { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
  room304: { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
  '304': { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
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
  const [y, x] = nodes[nodeKey] || nodes.START;
  return [x, y];
}

const CORRIDOR_NODE_KEYS = ['START', 'N_ROOM1', 'MAIN_CROSS', 'N_ROOM2_4', 'N_ROOM3_5', 'N_ROOM6'];

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

function nodeDistance(nodeA, nodeB) {
  const [y1, x1] = nodes[nodeA];
  const [y2, x2] = nodes[nodeB];
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * Heading angle in degrees (0° = Up/North, 90° = Right/East, 180° = Down/South, -90° = Left/West)
 */
function segmentBearingDeg(fromNode, toNode) {
  const [x1, y1] = pointForNode(fromNode);
  const [x2, y2] = pointForNode(toNode);
  return (Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI;
}

function normalizeDeltaDeg(angleDiff) {
  return ((angleDiff + 540) % 360) - 180;
}

/**
 * Computes Google Maps-style turn-by-turn instruction, turn icon, final side ("on your left/right"),
 * and the ideal Heads-Up map rotation angle so the user's walking direction points UP.
 */
function computeGoogleMapsGuidance(pathNodes, destinationRoom) {
  if (!destinationRoom || !pathNodes || pathNodes.length === 0) {
    return null;
  }

  if (pathNodes.length === 1) {
    return {
      icon: '📍',
      primaryText: `You have arrived at ${destinationRoom.name}`,
      secondaryText: `Destination ${destinationRoom.name} is right here`,
      headingDeg: 0,
      arrived: true,
    };
  }

  // First segment bearing (direction the user needs to walk right now)
  const firstBearing = segmentBearingDeg(pathNodes[0], pathNodes[1]);

  // Determine the final turn into the destination room (e.g. "Destination will be on your left/right")
  let finalSideText = `Destination ${destinationRoom.name} is straight ahead`;
  if (pathNodes.length >= 3) {
    const penultimateBearing = segmentBearingDeg(
      pathNodes[pathNodes.length - 3],
      pathNodes[pathNodes.length - 2]
    );
    const doorBearing = segmentBearingDeg(
      pathNodes[pathNodes.length - 2],
      pathNodes[pathNodes.length - 1]
    );
    const finalTurnDelta = normalizeDeltaDeg(doorBearing - penultimateBearing);
    if (finalTurnDelta < -20) {
      finalSideText = `Destination ${destinationRoom.name} will be on your left`;
    } else if (finalTurnDelta > 20) {
      finalSideText = `Destination ${destinationRoom.name} will be on your right`;
    }
  } else if (pathNodes.length === 2) {
    // Direct step into the room from the adjacent hallway node
    const [hx, hy] = pointForNode(pathNodes[0]);
    const [dx, dy] = pointForNode(pathNodes[1]);
    if (Math.abs(dx - hx) > Math.abs(dy - hy)) {
      finalSideText = `Enter ${destinationRoom.name} directly ahead`;
    }
  }

  // Determine immediate next turn instruction at pathNodes[1]
  let icon = '↑';
  let primaryText = `Head straight toward ${NODE_LABELS[pathNodes[1]] || pathNodes[1]}`;
  const startsInRoom = pathNodes[0].startsWith('D_');
  const startRoomLabel = NODE_LABELS[pathNodes[0]] || pathNodes[0];

  if (pathNodes.length === 2) {
    icon = '📍';
    primaryText = `Enter ${destinationRoom.name} ahead`;
  } else if (pathNodes.length >= 3) {
    const nextBearing = segmentBearingDeg(pathNodes[1], pathNodes[2]);
    const turnDelta = normalizeDeltaDeg(nextBearing - firstBearing);
    const targetLabel = NODE_LABELS[pathNodes[2]] || pathNodes[2];

    if (startsInRoom) {
      if (turnDelta < -20) {
        icon = '↰';
        primaryText = `Exit ${startRoomLabel} and turn left into corridor`;
      } else if (turnDelta > 20) {
        icon = '↱';
        primaryText = `Exit ${startRoomLabel} and turn right into corridor`;
      } else {
        icon = '↑';
        primaryText = `Exit ${startRoomLabel} straight toward ${targetLabel}`;
      }
    } else if (turnDelta < -20) {
      icon = '↰';
      primaryText = `Go straight, then turn left toward ${targetLabel}`;
    } else if (turnDelta > 20) {
      icon = '↱';
      primaryText = `Go straight, then turn right toward ${targetLabel}`;
    } else {
      icon = '↑';
      primaryText = `Continue straight past ${NODE_LABELS[pathNodes[1]]}`;
    }
  }

  return {
    icon,
    primaryText,
    secondaryText: finalSideText,
    headingDeg: firstBearing,
    arrived: false,
  };
}

function getShortestPathNodes(startNode, endNode) {
  if (!startNode || !endNode || !nodes[startNode] || !nodes[endNode]) return [];
  if (startNode === endNode) return [startNode];

  const distances = {};
  const previous = {};
  const unvisited = new Set(Object.keys(nodes));

  for (const key of unvisited) {
    distances[key] = Infinity;
  }
  distances[startNode] = 0;

  while (unvisited.size > 0) {
    let current = null;
    let smallestDist = Infinity;

    for (const key of unvisited) {
      if (distances[key] < smallestDist) {
        smallestDist = distances[key];
        current = key;
      }
    }

    if (!current || current === endNode || smallestDist === Infinity) break;
    unvisited.delete(current);

    for (const neighbor of graph[current] || []) {
      if (!unvisited.has(neighbor)) continue;
      const alt = distances[current] + nodeDistance(current, neighbor);
      if (alt < distances[neighbor]) {
        distances[neighbor] = alt;
        previous[neighbor] = current;
      }
    }
  }

  if (distances[endNode] === Infinity) return [];

  const path = [];
  let step = endNode;
  while (step) {
    path.unshift(step);
    step = previous[step];
  }
  return path;
}

function App() {
  const [activeBeacons, setActiveBeacons] = useState({});
  const [currentLocationNode, setCurrentLocationNode] = useState('START');
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'beacons'
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Tap a room to navigate or connect BLE beacons.');

  // Google Maps Rotation & Compass state
  const [headsUpMode, setHeadsUpMode] = useState(false);
  const [compassActive, setCompassActive] = useState(true);
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [manualRotation, setManualRotation] = useState(0);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  const svgRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const gestureRef = useRef({
    hasMoved: false,
    lastCenter: null,
    lastPinchDist: null,
    lastTwistAngle: null,
  });

  const beaconDataRef = useRef({});
  const deviceListenersRef = useRef(new Map());
  const globalAdvListenerRef = useRef(null);
  const activeScanRef = useRef(null);
  const currentLocRef = useRef(currentLocationNode);
  const compassBaselineRef = useRef(null);

  useEffect(() => {
    currentLocRef.current = currentLocationNode;
  }, [currentLocationNode]);

  const autoHidePanelOnMapTouch = useCallback(() => {
    if (window.innerWidth < 900) {
      setPanelOpen(false);
    }
  }, []);

  const selectedRoom = useMemo(
    () => rooms.find((item) => item.id === selectedRoomId) || null,
    [selectedRoomId]
  );

  const pathNodes = useMemo(() => {
    if (!selectedRoom) return [];
    return getShortestPathNodes(currentLocationNode, selectedRoom.targetNode);
  }, [currentLocationNode, selectedRoom]);

  const routePoints = useMemo(
    () => pathNodes.map((nodeKey) => pointForNode(nodeKey)),
    [pathNodes]
  );

  const guidance = useMemo(
    () => computeGoogleMapsGuidance(pathNodes, selectedRoom),
    [pathNodes, selectedRoom]
  );

  // Compute active user heading (from live phone compass OR current route segment)
  const activeUserHeadingDeg = useMemo(() => {
    if (guidance && !guidance.arrived) {
      return guidance.headingDeg + (compassActive && deviceHeading !== null ? deviceHeading : 0);
    }
    const defaultFacing =
      currentLocationNode.startsWith('D_') && graph[currentLocationNode]?.[0]
        ? segmentBearingDeg(currentLocationNode, graph[currentLocationNode][0])
        : 180;
    if (compassActive && deviceHeading !== null) {
      return (defaultFacing + deviceHeading) % 360;
    }
    return defaultFacing;
  }, [compassActive, currentLocationNode, deviceHeading, guidance]);

  // Compute overall map rotation: rotates smoothly as the phone turns or when Heads-Up mode is toggled
  const mapRotationDeg = useMemo(() => {
    const baseRouteRotation =
      headsUpMode && guidance && !guidance.arrived ? -guidance.headingDeg : manualRotation;
    const liveTurnOffset = compassActive && deviceHeading !== null ? -deviceHeading : 0;
    return baseRouteRotation + liveTurnOffset;
  }, [compassActive, deviceHeading, headsUpMode, guidance, manualRotation]);

  // Live Phone Gyroscope / Compass listener for real-time turning rotation
  useEffect(() => {
    if (!compassActive) return undefined;

    const handleOrientation = (event) => {
      let heading = null;
      if (typeof event.webkitCompassHeading === 'number') {
        heading = event.webkitCompassHeading;
      } else if (typeof event.alpha === 'number') {
        heading = (360 - event.alpha) % 360;
      }
      if (heading === null || Number.isNaN(heading)) return;

      // Calibrate baseline to 0° when the user first holds the phone so turning left/right rotates relative to initial hold
      if (compassBaselineRef.current === null) {
        compassBaselineRef.current = heading;
      }

      const deltaTurn = normalizeDeltaDeg(heading - compassBaselineRef.current);
      setDeviceHeading(Math.abs(deltaTurn) < 2 ? 0 : Math.round(deltaTurn));
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [compassActive]);

  const toggleCompassAndRotation = async () => {
    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') {
          compassBaselineRef.current = null;
          setCompassActive(true);
        }
      }
    } catch {
      // Ignore on browsers that don't require explicit permission
    }

    if (!headsUpMode) {
      compassBaselineRef.current = null;
      setDeviceHeading(0);
      setCompassActive(true);
      setHeadsUpMode(true);
      setManualRotation(0);
      setStatusMessage('Heads-Up Navigation ON: Map rotates with route & phone turns.');
    } else {
      compassBaselineRef.current = null;
      setDeviceHeading(0);
      setHeadsUpMode(false);
      setManualRotation(0);
      setStatusMessage('Map reset to North-Up (0°).');
    }
  };

  const refreshLocationFromBeacons = useCallback(() => {
    const now = Date.now();
    const liveList = Object.values(beaconDataRef.current).filter(
      (b) => b.valid && now - b.lastSeen < BEACON_TIMEOUT_MS
    );

    const nextState = {};
    liveList.forEach((b) => {
      nextState[b.canonicalName] = {
        ...b,
        ageSeconds: Math.max(0, Math.round((now - b.lastSeen) / 1000)),
      };
    });
    setActiveBeacons(nextState);

    if (liveList.length === 0) return;

    const sorted = [...liveList].sort((a, b) => b.smoothedRssi - a.smoothedRssi);
    const strongest = sorted[0];

    const currentBeacon = liveList.find((b) => b.targetNode === currentLocRef.current);
    let chosen = strongest;

    if (
      currentBeacon &&
      currentBeacon.canonicalName !== strongest.canonicalName &&
      strongest.smoothedRssi - currentBeacon.smoothedRssi < RSSI_HYSTERESIS_DBM
    ) {
      chosen = currentBeacon;
    }

    if (chosen.targetNode && chosen.targetNode !== currentLocRef.current) {
      setCurrentLocationNode(chosen.targetNode);
    }

    const authLabel = chosen.authenticated ? 'UUID Verified' : 'Verified';
    setStatusMessage(
      `${chosen.canonicalName} (${Math.round(chosen.smoothedRssi)} dBm • ${authLabel}) → Inside ${
        NODE_LABELS[chosen.targetNode]
      }`
    );
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (Object.keys(beaconDataRef.current).length > 0) {
        refreshLocationFromBeacons();
      }
    }, 1000);
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
      const smoothedRssi = existing
        ? existing.smoothedRssi * 0.6 + rawRssi * 0.4
        : rawRssi;

      beaconDataRef.current[slotKey] = {
        id: deviceId || slotKey,
        key: slotKey,
        name: validation.canonicalName,
        canonicalName: validation.canonicalName,
        targetNode: validation.targetNode,
        rssi: rawRssi,
        smoothedRssi,
        valid: true,
        authenticated: Boolean(existing?.authenticated || validation.authenticated),
        lastSeen: Date.now(),
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
        setStatusMessage('Web Bluetooth is not available in this browser. Use Chrome or Edge.');
        return;
      }

      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'No.' },
          { services: [BLE_SERVICE_UUID] },
        ],
        optionalServices: [BLE_SERVICE_UUID],
      });

      const resolvedName = device.name || '';
      const initialValidation = validateBeacon(resolvedName, [], false);
      if (!initialValidation.valid) {
        setStatusMessage(`Ignored: ${initialValidation.reason}`);
        return;
      }

      // Immediately place user inside this beacon's room
      currentLocRef.current = initialValidation.targetNode;
      setCurrentLocationNode(initialValidation.targetNode);

      if (typeof device.watchAdvertisements === 'function') {
        await watchSingleDevice(device, initialValidation.canonicalName);
        setStatusMessage(`You are in ${initialValidation.canonicalName} (watching live BLE RSSI).`);
      } else {
        setStatusMessage(`You are in ${initialValidation.canonicalName}. Select where to go.`);
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
      setStatusMessage('Web Bluetooth is not available in this browser. Use Chrome or Edge.');
      return;
    }

    if (typeof navigator.bluetooth.requestLEScan === 'function') {
      try {
        if (activeScanRef.current?.active) {
          activeScanRef.current.stop();
          setIsScanningAll(false);
          setStatusMessage('Auto-scan stopped.');
          return;
        }

        if (!globalAdvListenerRef.current) {
          const onGlobalAdv = (event) => {
            const rawName = event.device?.name || event.name || '';
            const advUuids = event.uuids || [];
            recordBeaconReading(event.device?.id, rawName, event.rssi, advUuids);
          };
          navigator.bluetooth.addEventListener('advertisementreceived', onGlobalAdv);
          globalAdvListenerRef.current = onGlobalAdv;
        }

        const scan = await navigator.bluetooth.requestLEScan({
          filters: [
            { namePrefix: 'No.' },
            { services: [BLE_SERVICE_UUID] },
          ],
          keepRepeatedDevices: true,
        });

        activeScanRef.current = scan;
        setIsScanningAll(true);
        setStatusMessage('Auto-scanning all No. 300 – No. 305 beacons…');
        return;
      } catch {
        // Fall through to connectBeacon if requestLEScan is unsupported on this OS
      }
    }

    await connectBeacon();
  };

  const routeMetrics = useMemo(() => {
    if (routePoints.length <= 1) {
      return { distancePixels: 0, seconds: 0 };
    }
    const distancePixels = routePoints.reduce((acc, pt, idx) => {
      if (idx === 0) return 0;
      const prev = routePoints[idx - 1];
      return acc + Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    }, 0);
    const seconds = Math.max(1, Math.round(distancePixels / 35));
    return { distancePixels, seconds };
  }, [routePoints]);

  const visibleRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.name.toLowerCase().includes(q));
  }, [roomSearch]);

  const debugBeacons = useMemo(
    () => Object.values(activeBeacons).sort((a, b) => b.smoothedRssi - a.smoothedRssi),
    [activeBeacons]
  );

  const resetMapView = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    compassBaselineRef.current = null;
    setDeviceHeading(0);
    setHeadsUpMode(false);
    setManualRotation(0);
  }, []);

  const zoomBy = useCallback((deltaFactor) => {
    setTransform((prev) => {
      const nextScale = Math.min(3.2, Math.max(0.85, Number((prev.scale * deltaFactor).toFixed(2))));
      if (nextScale === 1) return { scale: 1, x: 0, y: 0 };
      return { ...prev, scale: nextScale };
    });
  }, []);

  const navigateToRoom = useCallback((room, hidePanel = false) => {
    setSelectedRoomId(room.id);
    setStatusMessage(`Navigating to ${room.name}.`);
    if (hidePanel && window.innerWidth < 900) {
      setPanelOpen(false);
    }
  }, []);

  const clearNavigation = useCallback(() => {
    setSelectedRoomId(null);
    setManualRotation(0);
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
      gestureRef.current.lastTwistAngle = null;
    } else if (pts.length === 2) {
      gestureRef.current.hasMoved = true;
      setIsGestureActive(true);
      gestureRef.current.lastCenter = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      gestureRef.current.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gestureRef.current.lastTwistAngle =
        (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;
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
      const twistAngle = (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;

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

      if (gestureRef.current.lastTwistAngle !== null) {
        const deltaAngle = normalizeDeltaDeg(twistAngle - gestureRef.current.lastTwistAngle);
        if (Math.abs(deltaAngle) > 1.2) {
          setHeadsUpMode(false);
          setCompassActive(false);
          setManualRotation((prev) => (prev + deltaAngle) % 360);
        }
      }

      gestureRef.current.lastCenter = center;
      gestureRef.current.lastPinchDist = dist;
      gestureRef.current.lastTwistAngle = twistAngle;
    }
  };

  const handlePointerUpOrCancel = (e) => {
    activePointersRef.current.delete(e.pointerId);
    const pts = Array.from(activePointersRef.current.values());
    if (pts.length === 1) {
      gestureRef.current.lastCenter = { x: pts[0].x, y: pts[0].y };
      gestureRef.current.lastPinchDist = null;
      gestureRef.current.lastTwistAngle = null;
    } else if (pts.length === 0) {
      gestureRef.current.lastCenter = null;
      gestureRef.current.lastPinchDist = null;
      gestureRef.current.lastTwistAngle = null;
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

    // If tap is inside a room polygon, place the person dot inside that room
    const clickedRoom = findRoomContainingPoint(x, y);
    if (clickedRoom) {
      setCurrentLocationNode(clickedRoom.targetNode);
      setStatusMessage(`You are in ${clickedRoom.name}. Select where to go in the panel.`);
      return;
    }

    let bestNode = 'START';
    let bestDistance = Infinity;

    for (const nodeKey of CORRIDOR_NODE_KEYS) {
      const [nodeY, nodeX] = nodes[nodeKey];
      const distance = Math.hypot(y - nodeY, x - nodeX);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNode = nodeKey;
      }
    }

    setCurrentLocationNode(bestNode);
    setStatusMessage(`Current location set to ${NODE_LABELS[bestNode] || bestNode}.`);
  };

  const handleRoomPolygonClick = (event, room) => {
    event.stopPropagation();
    autoHidePanelOnMapTouch();
    if (gestureRef.current.hasMoved) return;
    setCurrentLocationNode(room.targetNode);
    setStatusMessage(
      selectedRoom
        ? `You are in ${room.name} → Navigating to ${selectedRoom.name}.`
        : `You are in ${room.name}. Open panel below to choose where to go.`
    );
  };

  const userPoint = pointForNode(currentLocationNode);
  const destPoint = selectedRoom ? pointForNode(selectedRoom.targetNode) : null;
  const counterRotation = -mapRotationDeg;

  return (
    <div className="nav-app">
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
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
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
              const isBeaconLive = Boolean(activeBeacons[room.name]);
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

            {routePoints.length > 1 && (
              <g className="fp-route-group">
                <polyline
                  points={routePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                  className="fp-route-casing"
                />
                <polyline
                  points={routePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                  className="fp-route-line"
                  filter="url(#glowFilter)"
                />
                <polyline
                  points={routePoints.map(([x, y]) => `${x},${y}`).join(' ')}
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

            {/* Google Maps Blue User Dot + Directional Heading Cone */}
            <g transform={`translate(${userPoint[0]}, ${userPoint[1]})`} className="fp-user-group">
              <g transform={`rotate(${activeUserHeadingDeg})`}>
                <path d="M 0 0 L -46 -110 A 120 120 0 0 1 46 -110 Z" fill="url(#beamGrad)" />
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
            <span className="brand-kicker">3RD FLOOR NAVIGATION</span>
            <h1 className="brand-title">Smart Room Tracker</h1>
          </div>

          <button
            type="button"
            className={`ble-pill-btn ${isScanningAll || debugBeacons.length > 0 ? 'is-live' : ''}`}
            onClick={connectBeacon}
          >
            <span className="ble-dot" />
            <span>
              {debugBeacons.length > 0
                ? `BLE (${debugBeacons.length}) • + Add`
                : '+ Add Beacon'}
            </span>
          </button>
        </div>

        {selectedRoom && guidance && (
          <div className="turn-banner" role="status" aria-live="polite">
            <div className="turn-direction-box" aria-hidden="true">
              {guidance.icon}
            </div>
            <div className="turn-body">
              <div className="turn-primary">{guidance.primaryText}</div>
              <div className="turn-destination-side">{guidance.secondaryText}</div>
              <div className="turn-meta">
                {guidance.arrived
                  ? `You are at ${selectedRoom.name}`
                  : `${NODE_LABELS[currentLocationNode]} → ${selectedRoom.name} • ~${routeMetrics.seconds} sec`}
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
      </header>

      {/* MAP COMPASS, ROTATION & ZOOM CONTROLS */}
      <div className="map-fab-stack" aria-label="Map controls">
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
            setHeadsUpMode(false);
            setCompassActive(false);
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

      {/* AUTO-HIDING BOTTOM DRAWER (MOBILE/TABLET) & LEFT PANEL (DESKTOP) */}
      <aside
        className={`control-sheet ${panelOpen ? 'is-open' : 'is-hidden'}`}
        aria-label="Navigation panel"
      >
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
              {panelOpen ? 'Hide ▼' : 'Rooms ▲'}
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
                {/* 1. CURRENT LOCATION SELECTOR (WHERE YOU ARE NOW) */}
                <div className="section-block">
                  <div className="section-label">📍 You Are In (Current Room / Spot):</div>
                  <div className="start-room-strip">
                    <button
                      type="button"
                      className={`start-pill ${currentLocationNode === 'START' ? 'is-active' : ''}`}
                      onClick={() => {
                        setCurrentLocationNode('START');
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
                            setCurrentLocationNode(room.targetNode);
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

                {selectedRoom && (
                  <div className="active-route-card">
                    <div className="route-stat-grid">
                      <div className="route-stat">
                        <span className="stat-label">From</span>
                        <strong className="stat-val">{NODE_LABELS[currentLocationNode]}</strong>
                      </div>
                      <div className="route-stat">
                        <span className="stat-label">To</span>
                        <strong className="stat-val accent">{selectedRoom.name}</strong>
                      </div>
                      <div className="route-stat">
                        <span className="stat-label">Walk Time</span>
                        <strong className="stat-val green">
                          {routeMetrics.seconds ? `~${routeMetrics.seconds}s` : 'Here'}
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
                    <div className="ble-status-title">Beacons (No. 300 – No. 305)</div>
                    <div className="ble-status-sub">UUID: {BLE_SERVICE_UUID.slice(0, 8)}…</div>
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
                      {isScanningAll ? 'Stop Scan' : 'Auto-Scan'}
                    </button>
                  </div>
                </div>

                <div className="debug-list">
                  {debugBeacons.length === 0 ? (
                    <div className="empty-ble-state">
                      <p>No active beacons detected yet.</p>
                      <small>Tap &ldquo;Auto-Scan&rdquo; or &ldquo;+ Pair&rdquo; to connect.</small>
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
                              {NODE_LABELS[beacon.targetNode]} • {ageSeconds}s ago
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
        </div>
      </aside>
    </div>
  );
}

export default App;
