import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BEACON_FILTERS,
  BEACON_TIMEOUT_MS,
  BLE_SERVICE_UUID,
  MIN_RSSI_SAMPLES,
  NODE_LABELS,
  RSSI_SAMPLE_INTERVAL_MS,
  RSSI_SAMPLE_WINDOW,
  WALKABLE_EDGES,
  graph,
  nodes,
  validateBeacon,
} from '../data/floorplanData.js';
import {
  bearingDegBetweenPoints,
  kalmanUpdateRssi,
  rssiToDistanceMeters,
  solveRealtimeBeaconPosition,
} from '../utils/indoorNavigation.js';

/**
 * Manages Web Bluetooth connections, advertisement watching, Kalman RSSI smoothing,
 * and continuous real-time indoor localization from BLE beacons.
 */
export function useBleBeacons({
  livePosRef,
  lastTravelAlignPosRef,
  currentLocRef,
  applyTravelCourseBearing,
  moveUserToNode,
  onPositionSolved,
  onStatusMessage,
  onBluetoothUnavailable,
}) {
  const [activeBeacons, setActiveBeacons] = useState({});
  const [isScanningAll, setIsScanningAll] = useState(false);

  const beaconDataRef = useRef({});
  const deviceListenersRef = useRef(new Map());
  const globalAdvListenerRef = useRef(null);
  const activeScanRef = useRef(null);

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
        onStatusMessage('No live beacon signal. Keeping last estimated location.');
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
      applyTravelCourseBearing(travelBearing);
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
      onPositionSolved(solved);
    }

    const sortedByDist = [...qualifiedList].sort((a, b) => a.distanceMeters - b.distanceMeters);
    const closest = sortedByDist[0];
    const second = sortedByDist[1];
    if (second) {
      onStatusMessage(
        `Live BLE (${sortedByDist.length}): ${closest.canonicalName} (~${closest.distanceMeters.toFixed(1)} m), ${second.canonicalName} (~${second.distanceMeters.toFixed(1)} m) → ${NODE_LABELS[solved.nearestNode]}`
      );
    } else {
      const authLabel = closest.authenticated ? 'UUID' : 'Valid';
      onStatusMessage(
        `Tracking ${closest.canonicalName} (~${closest.distanceMeters.toFixed(1)} m • ${Math.round(closest.smoothedRssi)} dBm • ${authLabel}) → ${NODE_LABELS[solved.nearestNode]}`
      );
    }
  }, [livePosRef, lastTravelAlignPosRef, applyTravelCourseBearing, onPositionSolved, onStatusMessage]);

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
          onStatusMessage(`Auto-watching ${restoredCount} saved beacon(s).`);
        }
      } catch {
        // Ignore if permission backend flag is not enabled
      }
    }
    restoreSavedBeacons();
    return () => {
      mounted = false;
    };
  }, [watchSingleDevice, onStatusMessage]);

  const connectBeacon = async () => {
    try {
      if (!navigator.bluetooth) {
        onStatusMessage('Web Bluetooth is not available in this browser. Use Chrome or Edge on HTTPS.');
        onBluetoothUnavailable();
        return;
      }

      const device = await navigator.bluetooth.requestDevice({
        filters: BEACON_FILTERS,
        optionalServices: [BLE_SERVICE_UUID],
      });

      const resolvedName = device.name || '';
      const initialValidation = validateBeacon(resolvedName, [], false);
      if (!initialValidation.valid) {
        onStatusMessage(`Ignored: ${initialValidation.reason}`);
        return;
      }

      const canWatchDevice = typeof device.watchAdvertisements === 'function';
      if (typeof device.watchAdvertisements === 'function') {
        await watchSingleDevice(device, initialValidation.canonicalName);
      }

      const scanResult = await startAdvertisementScan();
      if (scanResult.started) {
        onStatusMessage(
          `${scanResult.message} Location follows the nearest stable signal.`
        );
      } else if (canWatchDevice) {
        const scanHelp =
          typeof navigator.bluetooth.requestLEScan === 'function'
            ? 'If other beacons stop updating, start Scan Nearby.'
            : 'This browser cannot monitor multiple beacons with a shared scan.';
        onStatusMessage(
          `Watching ${initialValidation.canonicalName}. ${scanResult.message} ${scanHelp}`
        );
      } else {
        currentLocRef.current = initialValidation.targetNode;
        moveUserToNode(initialValidation.targetNode, 'manual');
        onStatusMessage(
          `You are in ${initialValidation.canonicalName}, but live BLE tracking is unavailable. ${scanResult.message}`
        );
      }
    } catch (error) {
      if (error?.name === 'NotFoundError') {
        onStatusMessage('Beacon selection cancelled.');
      } else {
        onStatusMessage(`Could not connect to beacon: ${error?.message || 'Unknown error'}`);
      }
    }
  };

  const startAutoScanBeacons = async () => {
    if (!navigator.bluetooth) {
      onStatusMessage('Web Bluetooth is not available in this browser. Use Chrome or Edge on HTTPS.');
      onBluetoothUnavailable();
      return;
    }

    if (activeScanRef.current?.active) {
      activeScanRef.current.stop();
      activeScanRef.current = null;
      setIsScanningAll(false);
      onStatusMessage('Auto-scan stopped.');
      return;
    }

    const scanResult = await startAdvertisementScan();
    onStatusMessage(
      scanResult.started
        ? `${scanResult.message} Location follows the nearest stable signal.`
        : `${scanResult.message} Use Add Beacon to select devices individually.`
    );
  };

  const debugBeacons = useMemo(
    () =>
      Object.values(activeBeacons).sort(
        (a, b) => Number(b.isLive) - Number(a.isLive) || b.smoothedRssi - a.smoothedRssi
      ),
    [activeBeacons]
  );
  const liveBeaconCount = debugBeacons.filter((beacon) => beacon.isLive).length;

  return {
    activeBeacons,
    debugBeacons,
    liveBeaconCount,
    isScanningAll,
    connectBeacon,
    startAutoScanBeacons,
  };
}
