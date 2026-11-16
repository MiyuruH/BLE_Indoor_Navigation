export const PX_PER_METER = 40;
export const RSSI_TX_POWER_1M = -59;
export const RSSI_PATH_LOSS_N = 2.5;
export const MIN_DISTANCE_M = 0.35;
export const MAX_DISTANCE_M = 25;

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function normalizeDeltaDeg(angleDiff) {
  return ((((angleDiff + 180) % 360) + 360) % 360) - 180;
}

export function pointForNode(nodes, nodeKey) {
  const [y, x] = nodes[nodeKey] || nodes.START;
  return [x, y];
}

export function nodeDistance(nodes, nodeA, nodeB) {
  const [y1, x1] = nodes[nodeA];
  const [y2, x2] = nodes[nodeB];
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * 1D scalar Kalman update for noisy indoor BLE RSSI advertisements.
 */
export function kalmanUpdateRssi(prevRssi, prevCov, rawRssi) {
  const Q = 0.09; // process variance (responsive to normal walking speed)
  const R = 3.2; // measurement noise variance (smooths indoor multipath spikes)

  if (typeof prevRssi !== 'number' || Number.isNaN(prevRssi)) {
    return { rssi: rawRssi, covariance: 4.0 };
  }

  const predictedCov = (typeof prevCov === 'number' ? prevCov : 4.0) + Q;
  const kalmanGain = predictedCov / (predictedCov + R);
  const nextRssi = prevRssi + kalmanGain * (rawRssi - prevRssi);
  const nextCov = (1 - kalmanGain) * predictedCov;

  return { rssi: nextRssi, covariance: nextCov };
}

/**
 * Log-distance path loss model converting filtered RSSI (dBm) into meters.
 */
export function rssiToDistanceMeters(
  rssi,
  txPower1m = RSSI_TX_POWER_1M,
  pathLossN = RSSI_PATH_LOSS_N
) {
  if (typeof rssi !== 'number' || Number.isNaN(rssi)) {
    return MAX_DISTANCE_M;
  }
  const exponent = (txPower1m - rssi) / (10 * pathLossN);
  return clamp(Math.pow(10, exponent), MIN_DISTANCE_M, MAX_DISTANCE_M);
}

/**
 * Heading angle in SVG map coordinates (0° = Up/North, 90° = Right/East, 180° = Down/South).
 */
export function bearingDegBetweenPoints(x1, y1, x2, y2) {
  return (Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI;
}

export function buildWalkableEdges(graph) {
  const seen = new Set();
  const edges = [];
  Object.entries(graph).forEach(([u, neighbors]) => {
    neighbors.forEach((v) => {
      const key = u < v ? `${u}|${v}` : `${v}|${u}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([u, v]);
      }
    });
  });
  return edges;
}

export function projectPointToEdge(px, py, nodes, u, v) {
  const [x1, y1] = pointForNode(nodes, u);
  const [x2, y2] = pointForNode(nodes, v);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { x: x1, y: y1, t: 0, distPx: Math.hypot(px - x1, py - y1), u, v };
  }

  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return {
    x: projX,
    y: projY,
    t,
    distPx: Math.hypot(px - projX, py - projY),
    u,
    v,
  };
}

export function snapPointToEdges(px, py, nodes, edges, preferredNodes = null) {
  let best = null;
  let bestScore = Infinity;

  for (const [u, v] of edges) {
    const proj = projectPointToEdge(px, py, nodes, u, v);
    let score = proj.distPx;
    // Slightly prefer corridor/doorway edges connected to active beacons when ties occur
    if (preferredNodes && (preferredNodes.has(u) || preferredNodes.has(v))) {
      score *= 0.9;
    }
    if (score < bestScore) {
      bestScore = score;
      best = proj;
    }
  }

  if (!best) {
    const [sx, sy] = pointForNode(nodes, 'START');
    return {
      x: sx,
      y: sy,
      edge: ['START', 'N_ROOM1'],
      t: 0,
      nearestNode: 'START',
      distPx: 0,
    };
  }

  const [ux, uy] = pointForNode(nodes, best.u);
  const [vx, vy] = pointForNode(nodes, best.v);
  const dU = Math.hypot(best.x - ux, best.y - uy);
  const dV = Math.hypot(best.x - vx, best.y - vy);

  return {
    x: best.x,
    y: best.y,
    edge: [best.u, best.v],
    t: best.t,
    distPx: best.distPx,
    nearestNode: dU <= dV ? best.u : best.v,
  };
}

export function getShortestPathData(nodes, graph, startNode, endNode) {
  if (!startNode || !endNode || !nodes[startNode] || !nodes[endNode]) {
    return { path: [], distancePx: Infinity };
  }
  if (startNode === endNode) {
    return { path: [startNode], distancePx: 0 };
  }

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
      const alt = distances[current] + nodeDistance(nodes, current, neighbor);
      if (alt < distances[neighbor]) {
        distances[neighbor] = alt;
        previous[neighbor] = current;
      }
    }
  }

  if (distances[endNode] === Infinity) {
    return { path: [], distancePx: Infinity };
  }

  const path = [];
  let step = endNode;
  while (step) {
    path.unshift(step);
    step = previous[step];
  }

  return { path, distancePx: distances[endNode] };
}

export function samplePointAlongNodePath(nodes, pathNodes, fraction) {
  if (!pathNodes || pathNodes.length === 0) return null;
  if (pathNodes.length === 1) {
    const [x, y] = pointForNode(nodes, pathNodes[0]);
    return { x, y, edge: [pathNodes[0], pathNodes[0]], t: 0, nearestNode: pathNodes[0] };
  }

  const segLengths = [];
  let totalLen = 0;
  for (let i = 0; i < pathNodes.length - 1; i += 1) {
    const len = nodeDistance(nodes, pathNodes[i], pathNodes[i + 1]);
    segLengths.push(len);
    totalLen += len;
  }

  if (totalLen <= 0) {
    const [x, y] = pointForNode(nodes, pathNodes[0]);
    return { x, y, edge: [pathNodes[0], pathNodes[1]], t: 0, nearestNode: pathNodes[0] };
  }

  let remaining = clamp(fraction, 0, 1) * totalLen;
  for (let i = 0; i < segLengths.length; i += 1) {
    const segLen = segLengths[i];
    const u = pathNodes[i];
    const v = pathNodes[i + 1];
    if (remaining <= segLen || i === segLengths.length - 1) {
      const t = segLen > 0 ? clamp(remaining / segLen, 0, 1) : 0;
      const [ux, uy] = pointForNode(nodes, u);
      const [vx, vy] = pointForNode(nodes, v);
      const x = ux + (vx - ux) * t;
      const y = uy + (vy - uy) * t;
      return {
        x,
        y,
        edge: [u, v],
        t,
        nearestNode: t <= 0.5 ? u : v,
      };
    }
    remaining -= segLen;
  }
  return null;
}

/**
 * Continuous Google Maps-style indoor localization from live BLE beacon distances:
 * - 1 beacon: interpolates along room <-> doorway corridor edge by estimated meter distance
 * - 2 beacons: interpolates along the walkable corridor shortest path between both anchors
 * - 3+ beacons: inverse-distance weighted centroid (WCL) map-matched onto walkable graph edges
 */
export function solveRealtimeBeaconPosition({
  liveBeacons,
  nodes,
  graph,
  edges,
  prevPos = null,
}) {
  if (!liveBeacons || liveBeacons.length === 0) return null;

  const sorted = [...liveBeacons].sort(
    (a, b) => a.distanceMeters - b.distanceMeters || b.smoothedRssi - a.smoothedRssi
  );
  const strongest = sorted[0];
  let solved = null;
  let accuracyPx = 48;

  if (sorted.length === 1) {
    const d1 = strongest.distanceMeters;
    const roomNode = strongest.targetNode;
    const doorwayNode = graph[roomNode]?.[0] || roomNode;
    const t = clamp((d1 - 0.9) / 5.5, 0, 1);
    const [ax, ay] = pointForNode(nodes, roomNode);
    const [jx, jy] = pointForNode(nodes, doorwayNode);
    const x = ax + (jx - ax) * t;
    const y = ay + (jy - ay) * t;
    const distToAnchor = Math.hypot(x - ax, y - ay);
    const distToDoor = Math.hypot(x - jx, y - jy);

    solved = {
      x,
      y,
      edge: [roomNode, doorwayNode],
      t,
      nearestNode: distToAnchor <= distToDoor ? roomNode : doorwayNode,
    };
    accuracyPx = clamp(34 + d1 * 9.5, 36, 108);
  } else if (sorted.length === 2) {
    const b1 = sorted[0];
    const b2 = sorted[1];
    const d1 = b1.distanceMeters;
    const d2 = b2.distanceMeters;
    const w1 = 1 / (Math.pow(d1, 2.2) + 0.35);
    const w2 = 1 / (Math.pow(d2, 2.2) + 0.35);
    const fraction = w2 / (w1 + w2);

    const { path } = getShortestPathData(nodes, graph, b1.targetNode, b2.targetNode);
    solved = samplePointAlongNodePath(nodes, path, fraction);
    accuracyPx = clamp(32 + Math.min(d1, d2) * 7.5, 34, 92);
  } else {
    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    const preferred = new Set();

    sorted.slice(0, 4).forEach((b, idx) => {
      const [bx, by] = pointForNode(nodes, b.targetNode);
      const w = 1 / (Math.pow(b.distanceMeters, 2.2) + 0.35);
      sumW += w;
      sumX += w * bx;
      sumY += w * by;
      if (idx < 2) preferred.add(b.targetNode);
    });

    const wclX = sumW > 0 ? sumX / sumW : pointForNode(nodes, strongest.targetNode)[0];
    const wclY = sumW > 0 ? sumY / sumW : pointForNode(nodes, strongest.targetNode)[1];
    solved = snapPointToEdges(wclX, wclY, nodes, edges, preferred);
    accuracyPx = clamp(30 + strongest.distanceMeters * 6.5, 32, 84);
  }

  if (!solved) return null;

  // Temporal velocity guard during continuous BLE updates (prevents momentary RF multipath teleports)
  if (prevPos && prevPos.source === 'ble') {
    const stepDist = Math.hypot(solved.x - prevPos.x, solved.y - prevPos.y);
    const maxStepPx = 220;
    if (stepDist > maxStepPx) {
      const ratio = maxStepPx / stepDist;
      const blendedX = prevPos.x + (solved.x - prevPos.x) * ratio;
      const blendedY = prevPos.y + (solved.y - prevPos.y) * ratio;
      solved = snapPointToEdges(blendedX, blendedY, nodes, edges);
    }
  }

  return {
    ...solved,
    accuracyPx: Math.round(accuracyPx),
    strongestBeacon: strongest,
    liveCount: sorted.length,
    source: 'ble',
  };
}

/**
 * Computes the continuous shortest polyline from any live walkable edge coordinate
 * directly to a room node OR a pinned point along any walkable edge — updating in real time.
 */
export function computeLiveRouteFromPosition({
  nodes,
  graph,
  userPos,
  destNode,
  destPos = null,
}) {
  const empty = {
    points: [],
    remainingNodes: [],
    distancePx: 0,
    distanceMeters: 0,
    seconds: 0,
  };

  if (!userPos) return empty;

  const isCustomPin = Boolean(destPos && typeof destPos.x === 'number' && typeof destPos.y === 'number');
  let targetPos = null;
  if (isCustomPin) {
    targetPos = {
      x: destPos.x,
      y: destPos.y,
      edge: destPos.edge || [destPos.nearestNode || 'START', destPos.nearestNode || 'START'],
      nearestNode: destPos.nearestNode || destPos.edge?.[0] || 'START',
    };
  } else if (destNode && nodes[destNode]) {
    const [dx, dy] = pointForNode(nodes, destNode);
    targetPos = {
      x: dx,
      y: dy,
      edge: [destNode, destNode],
      nearestNode: destNode,
    };
  } else {
    return empty;
  }

  const [pu, pv] = userPos.edge || ['START', 'START'];
  const [du, dv] = targetPos.edge;

  const sameEdge =
    pu !== pv &&
    du !== dv &&
    ((pu === du && pv === dv) || (pu === dv && pv === du));

  let points;
  let remainingNodes;

  if (sameEdge) {
    points = [
      [userPos.x, userPos.y],
      [targetPos.x, targetPos.y],
    ];
    remainingNodes = [targetPos.nearestNode];
  } else {
    const startCandidates = pu === pv ? [pu] : [pu, pv];
    const endCandidates = du === dv ? [du] : [du, dv];

    let bestTotal = Infinity;
    let bestPath = [];

    for (const sNode of startCandidates) {
      const [sx, sy] = pointForNode(nodes, sNode);
      const startGap = Math.hypot(sx - userPos.x, sy - userPos.y);
      for (const eNode of endCandidates) {
        const [ex, ey] = pointForNode(nodes, eNode);
        const endGap = Math.hypot(targetPos.x - ex, targetPos.y - ey);
        const { path, distancePx } = getShortestPathData(nodes, graph, sNode, eNode);
        const total = startGap + distancePx + endGap;
        if (path.length > 0 && total < bestTotal) {
          bestTotal = total;
          bestPath = path;
        }
      }
    }

    if (bestPath.length === 0) return empty;

    remainingNodes = [...bestPath];
    if (remainingNodes.length > 1) {
      const [fx, fy] = pointForNode(nodes, remainingNodes[0]);
      if (Math.hypot(fx - userPos.x, fy - userPos.y) < 14) {
        remainingNodes.shift();
      }
    }
    if (isCustomPin && remainingNodes.length > 1) {
      const lastKey = remainingNodes[remainingNodes.length - 1];
      const [lx, ly] = pointForNode(nodes, lastKey);
      if (Math.hypot(targetPos.x - lx, targetPos.y - ly) < 14) {
        remainingNodes.pop();
      }
    }

    points = [
      [userPos.x, userPos.y],
      ...remainingNodes.map((nodeKey) => pointForNode(nodes, nodeKey)),
    ];

    if (isCustomPin) {
      const lastPt = points[points.length - 1];
      if (Math.hypot(targetPos.x - lastPt[0], targetPos.y - lastPt[1]) > 4) {
        points.push([targetPos.x, targetPos.y]);
      }
    }
  }

  let distancePx = 0;
  for (let i = 1; i < points.length; i += 1) {
    distancePx += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }

  const distanceMeters = distancePx > 25 ? Math.max(1, Math.round(distancePx / PX_PER_METER)) : 0;
  const seconds = distancePx > 25 ? Math.max(1, Math.round(distancePx / 35)) : 0;

  return {
    points,
    remainingNodes,
    distancePx,
    distanceMeters,
    seconds,
  };
}

/**
 * Generates real-time turn-by-turn navigation guidance from continuous route polyline.
 */
export function computeRealtimeGuidance({
  routeData,
  destinationRoom,
  nodeLabels,
  userNearestNode,
}) {
  if (!destinationRoom || !routeData || routeData.points.length === 0) {
    return null;
  }

  const { points, remainingNodes, distancePx } = routeData;
  const isCustomPin = destinationRoom.kind === 'pin';

  if (
    distancePx < 58 ||
    (!isCustomPin &&
      (remainingNodes.length === 0 ||
        (remainingNodes.length === 1 &&
          remainingNodes[0] === destinationRoom.targetNode &&
          distancePx < 65)))
  ) {
    return {
      icon: '📍',
      primaryText: `You have arrived at ${destinationRoom.name}`,
      secondaryText: `Destination ${destinationRoom.name} is right here`,
      headingDeg: 0,
      arrived: true,
    };
  }

  const firstBearing = bearingDegBetweenPoints(
    points[0][0],
    points[0][1],
    points[1][0],
    points[1][1]
  );

  let finalSideText = `Destination ${destinationRoom.name} is straight ahead`;
  if (points.length >= 3) {
    const n = points.length;
    const penBearing = bearingDegBetweenPoints(
      points[n - 3][0],
      points[n - 3][1],
      points[n - 2][0],
      points[n - 2][1]
    );
    const doorBearing = bearingDegBetweenPoints(
      points[n - 2][0],
      points[n - 2][1],
      points[n - 1][0],
      points[n - 1][1]
    );
    const finalTurnDelta = normalizeDeltaDeg(doorBearing - penBearing);
    if (finalTurnDelta < -20) {
      finalSideText = `Destination ${destinationRoom.name} will be on your left`;
    } else if (finalTurnDelta > 20) {
      finalSideText = `Destination ${destinationRoom.name} will be on your right`;
    }
  } else if (points.length === 2) {
    finalSideText = isCustomPin
      ? `Destination ${destinationRoom.name} is straight ahead`
      : `Enter ${destinationRoom.name} directly ahead`;
  }

  let icon = '↑';
  const nextWaypoint = remainingNodes[0];
  let primaryText = `Head straight toward ${nodeLabels[nextWaypoint] || nextWaypoint}`;

  if (points.length === 2 || (!isCustomPin && nextWaypoint === destinationRoom.targetNode)) {
    icon = '📍';
    primaryText = isCustomPin
      ? `Approach ${destinationRoom.name} ahead`
      : `Enter ${destinationRoom.name} ahead`;
  } else if (points.length >= 3) {
    const nextBearing = bearingDegBetweenPoints(
      points[1][0],
      points[1][1],
      points[2][0],
      points[2][1]
    );
    const turnDelta = normalizeDeltaDeg(nextBearing - firstBearing);
    const targetAfterTurn = remainingNodes[1] || nextWaypoint;
    const targetLabel = nodeLabels[targetAfterTurn] || targetAfterTurn;
    const startsInRoom = Boolean(userNearestNode && userNearestNode.startsWith('D_'));
    const startRoomLabel = nodeLabels[userNearestNode] || userNearestNode;

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
      primaryText = `Continue straight past ${nodeLabels[nextWaypoint] || nextWaypoint}`;
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

/**
 * Singularity-free ZXY rotation-matrix heading extraction for mobile DeviceOrientation:
 * blends phone top (+Y_device) when flat with back-camera forward (-Z_device) when upright,
 * avoiding beta=90° Euler gimbal lock jumps across Android Chrome and iOS Safari.
 */
export function extractPhoneHeadingDeg(event, screenAngleDeg = 0) {
  let heading = null;

  if (typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    if (
      typeof event.beta === 'number' &&
      Number.isFinite(event.beta) &&
      typeof event.gamma === 'number' &&
      Number.isFinite(event.gamma)
    ) {
      const d = Math.PI / 180;
      const cA = Math.cos(event.alpha * d);
      const sA = Math.sin(event.alpha * d);
      const cB = Math.cos(event.beta * d);
      const sB = Math.sin(event.beta * d);
      const cG = Math.cos(event.gamma * d);
      const sG = Math.sin(event.gamma * d);

      // Column 2 (+Y_device top edge projected onto Earth horizontal EN plane)
      const yEast = -cB * sA;
      const yNorth = cA * cB;

      // Negative Column 3 (-Z_device camera forward projected onto Earth horizontal EN plane)
      const fEast = -(sA * sB * cG + cA * sG);
      const fNorth = cA * cG * sB - sA * sG;

      // Smoothly weight flat (+Y) vs upright (-Z) posture with non-negative weights (no beta>90 flip)
      const wY = Math.max(0, cB);
      const wZ = Math.max(0, sB);
      let hEast = wY * yEast + wZ * fEast;
      let hNorth = wY * yNorth + wZ * fNorth;

      // Extreme posture fallback (screen upside down or rolled >80°) via +X_device perpendicular
      if (hEast * hEast + hNorth * hNorth < 0.04) {
        const xEast = cA * cG - sA * sB * sG;
        const xNorth = sA * cG + cA * sB * sG;
        if (xEast * xEast + xNorth * xNorth < 0.04) {
          return null;
        }
        heading = (Math.atan2(-xNorth, xEast) * 180) / Math.PI;
      } else {
        heading = (Math.atan2(hEast, hNorth) * 180) / Math.PI;
      }
    } else {
      heading = (360 - event.alpha) % 360;
    }
  } else if (
    typeof event.webkitCompassHeading === 'number' &&
    Number.isFinite(event.webkitCompassHeading)
  ) {
    heading = event.webkitCompassHeading;
  }

  if (heading === null || !Number.isFinite(heading)) {
    return null;
  }

  return (heading + screenAngleDeg + 360) % 360;
}

/**
 * Computes whether the map should align to a route leg or upcoming turn/junction.
 * Keeps straight corridor walking and standing rotation completely steady while
 * rotating the map once per turn/junction as the user enters or turns into it.
 */
export function resolveRouteJunctionHeading({
  routePoints,
  alignedHeadingDeg = null,
  liveHeadingDeg = null,
  junctionState = null,
  turnThresholdDeg = 30,
  junctionCorePx = 28,
  junctionApproachPx = 56,
  backtrackClearPx = 76,
}) {
  if (!routePoints || routePoints.length < 2) {
    return {
      targetHeadingDeg: alignedHeadingDeg,
      turnTriggered: false,
      junctionState: null,
      gyroTurnCandidate: null,
    };
  }

  let totalDistPx = 0;
  for (let i = 1; i < routePoints.length; i += 1) {
    totalDistPx += Math.hypot(
      routePoints[i][0] - routePoints[i - 1][0],
      routePoints[i][1] - routePoints[i - 1][1]
    );
  }

  if (totalDistPx < 58) {
    return {
      targetHeadingDeg: alignedHeadingDeg,
      turnTriggered: false,
      junctionState,
      gyroTurnCandidate: null,
    };
  }

  const p0 = routePoints[0];
  const p1 = routePoints[1];
  const leg1Dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);

  let curBearing = bearingDegBetweenPoints(p0[0], p0[1], p1[0], p1[1]);
  let lookIndex = 1;

  // Avoid noisy bearings from <12px waypoint stubs by using the immediate outgoing leg
  if (leg1Dist < 12 && routePoints.length >= 3) {
    const p2 = routePoints[2];
    if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) >= 12) {
      curBearing = bearingDegBetweenPoints(p1[0], p1[1], p2[0], p2[1]);
      lookIndex = 2;
    }
  }

  let nextTurnCorner = null;
  if (routePoints.length > lookIndex + 1) {
    const corner = routePoints[lookIndex];
    const after = routePoints[lookIndex + 1];
    const cornerDist = Math.hypot(corner[0] - p0[0], corner[1] - p0[1]);
    const outgoingDist = Math.hypot(after[0] - corner[0], after[1] - corner[1]);
    const nextBearing = bearingDegBetweenPoints(corner[0], corner[1], after[0], after[1]);
    const cornerDelta = Math.abs(normalizeDeltaDeg(nextBearing - curBearing));

    if (outgoingDist >= 18 && cornerDelta >= turnThresholdDeg) {
      nextTurnCorner = {
        cornerX: corner[0],
        cornerY: corner[1],
        cornerDist,
        nextBearing,
      };
    }
  }

  let activeLock = junctionState;
  if (activeLock) {
    const distFromLockedCorner = Math.hypot(p0[0] - activeLock.cornerX, p0[1] - activeLock.cornerY);
    const alreadyOnLockedLeg =
      Math.abs(normalizeDeltaDeg(curBearing - activeLock.headingDeg)) < 22;

    if (distFromLockedCorner > backtrackClearPx || alreadyOnLockedLeg) {
      activeLock = null;
    } else {
      return {
        targetHeadingDeg: activeLock.headingDeg,
        turnTriggered: false,
        junctionState: activeLock,
        gyroTurnCandidate: null,
      };
    }
  }

  if (nextTurnCorner) {
    const { cornerX, cornerY, cornerDist, nextBearing } = nextTurnCorner;
    const enteredCornerCore = cornerDist <= junctionCorePx;
    const turnedAtApproach =
      cornerDist <= junctionApproachPx &&
      typeof liveHeadingDeg === 'number' &&
      Number.isFinite(liveHeadingDeg) &&
      Math.abs(normalizeDeltaDeg(liveHeadingDeg - nextBearing)) <= 38 &&
      Math.abs(normalizeDeltaDeg(liveHeadingDeg - nextBearing)) + 12 <
        Math.abs(normalizeDeltaDeg(liveHeadingDeg - curBearing));

    if (enteredCornerCore || turnedAtApproach) {
      const movedHeading =
        alignedHeadingDeg === null ||
        Math.abs(normalizeDeltaDeg(nextBearing - alignedHeadingDeg)) >= turnThresholdDeg;
      return {
        targetHeadingDeg: nextBearing,
        turnTriggered: movedHeading,
        junctionState: {
          cornerX,
          cornerY,
          headingDeg: nextBearing,
        },
        gyroTurnCandidate: null,
      };
    }

    if (cornerDist <= junctionApproachPx) {
      const targetHeading =
        alignedHeadingDeg !== null &&
        Math.abs(normalizeDeltaDeg(curBearing - alignedHeadingDeg)) < turnThresholdDeg
          ? alignedHeadingDeg
          : curBearing;
      return {
        targetHeadingDeg: targetHeading,
        turnTriggered:
          alignedHeadingDeg === null ||
          Math.abs(normalizeDeltaDeg(targetHeading - alignedHeadingDeg)) >= turnThresholdDeg,
        junctionState: null,
        gyroTurnCandidate: {
          curBearing,
          nextBearing,
          cornerX,
          cornerY,
        },
      };
    }
  }

  if (
    alignedHeadingDeg === null ||
    Math.abs(normalizeDeltaDeg(curBearing - alignedHeadingDeg)) >= turnThresholdDeg
  ) {
    return {
      targetHeadingDeg: curBearing,
      turnTriggered: true,
      junctionState: null,
      gyroTurnCandidate: null,
    };
  }

  return {
    targetHeadingDeg: alignedHeadingDeg,
    turnTriggered: false,
    junctionState: null,
    gyroTurnCandidate: null,
  };
}
