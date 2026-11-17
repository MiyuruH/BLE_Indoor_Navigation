import {
  bearingDegBetweenPoints,
  buildWalkableEdges,
  pointForNode as navPointForNode,
} from '../utils/indoorNavigation.js';

export const MAP_WIDTH = 1102;
export const MAP_HEIGHT = 1672;

export const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const BEACON_FILTERS = [
  { namePrefix: 'No.' },
  { services: [BLE_SERVICE_UUID] },
];
export const BEACON_TIMEOUT_MS = 15000;
export const RSSI_SAMPLE_INTERVAL_MS = 200;
export const RSSI_SAMPLE_WINDOW = 7;
export const MIN_RSSI_SAMPLES = 1;

export const nodes = {
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

export const NODE_LABELS = {
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

export const graph = {
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

export const rooms = [
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

export const buildingShell = [[7.5, 7.5], [7.5, 1094.5], [1664.5, 1094.5], [1664.5, 7.5]];
export const corridorPolygon = [
  [7.5, 7.5],
  [7.5, 284.5],
  [676.5, 284.5],
  [676.5, 1094.5],
  [921.5, 1094.5],
  [921.5, 284.5],
  [1664.5, 284.5],
  [1664.5, 7.5],
];

export const BUILDING_SHELL_POINTS = buildingShell.map(([y, x]) => `${x},${y}`).join(' ');
export const CORRIDOR_POINTS = corridorPolygon.map(([y, x]) => `${x},${y}`).join(' ');
export const ROOM_POLYGONS = rooms.reduce((acc, room) => {
  acc[room.id] = room.polygon.map(([y, x]) => `${x},${y}`).join(' ');
  return acc;
}, {});

export const AUTHORIZED_BEACONS = {
  no300: { canonicalName: 'No. 300', targetNode: 'D_ROOM1' },
  no301: { canonicalName: 'No. 301', targetNode: 'D_ROOM2' },
  no302: { canonicalName: 'No. 302', targetNode: 'D_ROOM3' },
  no303: { canonicalName: 'No. 303', targetNode: 'D_ROOM4' },
  no304: { canonicalName: 'No. 304', targetNode: 'D_ROOM5' },
  no305: { canonicalName: 'No. 305', targetNode: 'D_ROOM6' },
};

export const WALKABLE_EDGES = buildWalkableEdges(graph);
export const CORRIDOR_EDGES = WALKABLE_EDGES.filter(
  ([u, v]) => !u.startsWith('D_') && !v.startsWith('D_')
);

export function normalizeBeaconName(beaconName) {
  return (beaconName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function validateBeacon(rawName, advertisedUuids = [], gattVerified = false) {
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

export function pointForNode(nodeKey) {
  return navPointForNode(nodes, nodeKey);
}

export function createNodePosition(nodeKey, source = 'manual', accuracyPx = 38) {
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

export function findRoomContainingPoint(x, y) {
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
export function segmentBearingDeg(fromNode, toNode) {
  const [x1, y1] = pointForNode(fromNode);
  const [x2, y2] = pointForNode(toNode);
  return bearingDegBetweenPoints(x1, y1, x2, y2);
}
