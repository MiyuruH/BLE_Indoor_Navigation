import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ControlSheet from './ControlSheet.jsx';
import FloorPlanMap from './FloorPlanMap.jsx';
import MapFabStack from './MapFabStack.jsx';
import ProjectGuide from './ProjectGuide.jsx';
import TopHud from './TopHud.jsx';
import {
  BLE_SERVICE_UUID,
  CORRIDOR_EDGES,
  MAP_HEIGHT,
  MAP_WIDTH,
  NODE_LABELS,
  createNodePosition,
  findRoomContainingPoint,
  graph,
  nodes,
  pointForNode,
  rooms,
  segmentBearingDeg,
} from '../data/floorplanData.js';
import { useBleBeacons } from '../hooks/useBleBeacons.js';
import { useGyroCompass } from '../hooks/useGyroCompass.js';
import {
  computeLiveRouteFromPosition,
  computeRealtimeGuidance,
  snapPointToEdges,
} from '../utils/indoorNavigation.js';

/**
 * Interactive 3rd-floor BLE indoor navigation screen combining live beacon localization,
 * shortest-path route trimming, gyroscope heading beam, and junction auto-alignment.
 */
export default function IndoorNavigator({ onBackHome }) {
  const [livePosition, setLivePosition] = useState(() => createNodePosition('START', 'manual', 38));
  const currentLocationNode = livePosition.nearestNode;
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [customPin, setCustomPin] = useState(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'beacons'
  const [guideOpen, setGuideOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Tap a room to navigate or connect BLE beacons.');
  const [mapToast, setMapToast] = useState('');
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
  const prevStatusRef = useRef(statusMessage);

  useEffect(() => {
    currentLocRef.current = currentLocationNode;
    livePosRef.current = livePosition;
  }, [currentLocationNode, livePosition]);

  const moveUserToNode = useCallback((nodeKey, source = 'manual') => {
    const nextPos = createNodePosition(nodeKey, source, 38);
    lastTravelAlignPosRef.current = { x: nextPos.x, y: nextPos.y };
    setLivePosition(nextPos);
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

  useEffect(() => {
    if (statusMessage === prevStatusRef.current) {
      if (panelOpen) setMapToast('');
      return undefined;
    }
    prevStatusRef.current = statusMessage;
    if (!statusMessage || panelOpen || window.innerWidth >= 900) {
      setMapToast('');
      return undefined;
    }
    setMapToast(statusMessage);
    const timer = setTimeout(() => setMapToast(''), 4200);
    return () => clearTimeout(timer);
  }, [statusMessage, panelOpen]);

  const {
    compassActive,
    mapRotationDeg,
    initialUserHeadingDeg,
    alignRouteOnce,
    toggleCompassAndRotation,
    rotateMapManual90,
    resetHeadingView,
    clearHeading,
    applyTravelCourseBearing,
  } = useGyroCompass({
    defaultFacingDeg,
    routeData,
    activeDestination,
    guidance,
    userBeamRef,
    onStatusMessage: setStatusMessage,
  });

  const handleBluetoothUnavailable = useCallback(() => {
    setActiveTab('beacons');
    if (window.innerWidth < 900) {
      setPanelOpen(true);
    }
  }, []);

  const {
    activeBeacons,
    debugBeacons,
    liveBeaconCount,
    isScanningAll,
    connectBeacon,
    startAutoScanBeacons,
  } = useBleBeacons({
    livePosRef,
    lastTravelAlignPosRef,
    currentLocRef,
    applyTravelCourseBearing,
    moveUserToNode,
    onPositionSolved: setLivePosition,
    onStatusMessage: setStatusMessage,
    onBluetoothUnavailable: handleBluetoothUnavailable,
  });

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

  const resetMapView = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    resetHeadingView();
  }, [resetHeadingView]);

  const zoomBy = useCallback((deltaFactor) => {
    setTransform((prev) => {
      const nextScale = Math.min(3.2, Math.max(0.85, Number((prev.scale * deltaFactor).toFixed(2))));
      if (nextScale === 1) return { scale: 1, x: 0, y: 0 };
      return { ...prev, scale: nextScale };
    });
  }, []);

  const navigateToRoom = useCallback(
    (room, hidePanel = false) => {
      setCustomPin(null);
      setSelectedRoomId(room.id);

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
    const idleDeg =
      currentLocRef.current.startsWith('D_') && graph[currentLocRef.current]?.[0]
        ? segmentBearingDeg(currentLocRef.current, graph[currentLocRef.current][0])
        : 180;
    clearHeading(idleDeg);
    setStatusMessage('Navigation cleared.');
  }, [clearHeading]);

  // Unified Pointer Events for 1-finger pan & 2-finger pinch zoom
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
      <FloorPlanMap
        panelOpen={panelOpen}
        isGestureActive={isGestureActive}
        transform={transform}
        mapRotationDeg={mapRotationDeg}
        counterRotation={counterRotation}
        svgRef={svgRef}
        userGroupRef={userGroupRef}
        userAccuracyRef={userAccuracyRef}
        userBeamRef={userBeamRef}
        routeCasingRef={routeCasingRef}
        routeLineRef={routeLineRef}
        routeFlowRef={routeFlowRef}
        selectedRoomId={selectedRoomId}
        currentLocationNode={currentLocationNode}
        activeBeacons={activeBeacons}
        renderedRoutePoints={renderedRoutePoints}
        renderedRouteStr={renderedRouteStr}
        destPoint={destPoint}
        userPoint={userPoint}
        visualAccuracyPx={visualAccuracyPx}
        initialUserHeadingDeg={initialUserHeadingDeg}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUpOrCancel={handlePointerUpOrCancel}
        onWheel={handleWheel}
        onHallwayClick={handleHallwayClick}
        onRoomPolygonClick={handleRoomPolygonClick}
      />

      <TopHud
        isScanningAll={isScanningAll}
        debugBeaconsCount={debugBeacons.length}
        liveBeaconCount={liveBeaconCount}
        onConnectBeacon={connectBeacon}
        isReloading={isReloading}
        onMobileReload={handleMobileReload}
        activeDestination={activeDestination}
        guidance={guidance}
        currentLocationNode={currentLocationNode}
        routeMetrics={routeMetrics}
        onClearNavigation={clearNavigation}
        mapToast={mapToast}
        onDismissMapToast={() => setMapToast('')}
      />

      <MapFabStack
        compassActive={compassActive}
        mapRotationDeg={mapRotationDeg}
        onToggleCompass={toggleCompassAndRotation}
        onRotate90={rotateMapManual90}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onResetView={resetMapView}
      />

      <ControlSheet
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((prev) => !prev)}
        currentLocationNode={currentLocationNode}
        statusMessage={statusMessage}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        visibleRooms={visibleRooms}
        roomSearch={roomSearch}
        onRoomSearchChange={setRoomSearch}
        selectedRoomId={selectedRoomId}
        activeDestination={activeDestination}
        routeMetrics={routeMetrics}
        onMoveUserToNode={moveUserToNode}
        onStatusMessage={setStatusMessage}
        onSelectDestinationRoom={navigateToRoom}
        onClearNavigation={clearNavigation}
        debugBeacons={debugBeacons}
        isScanningAll={isScanningAll}
        onConnectBeacon={connectBeacon}
        onStartAutoScan={startAutoScanBeacons}
        onOpenGuide={() => setGuideOpen(true)}
        onBackHome={onBackHome}
      />

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
