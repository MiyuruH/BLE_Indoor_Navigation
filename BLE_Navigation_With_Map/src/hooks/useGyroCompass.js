import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bearingDegBetweenPoints,
  extractPhoneHeadingDeg,
  normalizeDeltaDeg,
  resolveRouteJunctionHeading,
} from '../utils/indoorNavigation.js';

/**
 * Manages mobile gyroscope orientation for the blue person dot cone and
 * route-start + turn/junction map alignment without continuous map spin.
 */
export function useGyroCompass({
  defaultFacingDeg,
  routeData,
  activeDestination,
  guidance,
  userBeamRef,
  onStatusMessage,
}) {
  const [headsUpMode, setHeadsUpMode] = useState(false);
  const [compassActive, setCompassActive] = useState(true);
  const [sensorEpoch, setSensorEpoch] = useState(0);
  const [manualRotation, setManualRotation] = useState(0);

  const compassBaselineRef = useRef(null);
  const deviceHeadingRef = useRef(0);
  const headingAtBaselineRef = useRef(180);
  const hasGyroSampleRef = useRef(false);
  const alignedHeadingRef = useRef(null);
  const junctionLockRef = useRef(null);
  const gyroTurnCandidateRef = useRef(null);
  const headsUpModeRef = useRef(headsUpMode);
  const unwrappedRotationRef = useRef(0);

  useEffect(() => {
    headsUpModeRef.current = headsUpMode;
  }, [headsUpMode]);

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
  }, [defaultFacingDeg, compassActive, userBeamRef]);

  // Map stays steady along straight corridors and while turning on the spot; it rotates at start
  // and when reaching/turning at an actual route turn or junction (headsUpMode).
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
  }, [compassActive, sensorEpoch, userBeamRef]);

  const alignRouteOnce = useCallback(
    (nextRoute) => {
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
        userBeamRef.current?.setAttribute(
          'transform',
          `rotate(${Math.round(pathDirectionDeg * 10) / 10})`
        );
      } else {
        alignedHeadingRef.current = null;
        junctionLockRef.current = null;
        gyroTurnCandidateRef.current = null;
        setHeadsUpMode(false);
        setManualRotation(0);
      }
    },
    [userBeamRef]
  );

  const toggleCompassAndRotation = useCallback(async () => {
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
      onStatusMessage('Map aligned to route & turns. Person indicator tracks your phone direction.');
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
      onStatusMessage('Map set to North-Up (0°). Person indicator calibrated.');
    }
  }, [headsUpMode, guidance, routeData, alignRouteOnce, defaultFacingDeg, userBeamRef, onStatusMessage]);

  const rotateMapManual90 = useCallback(() => {
    alignedHeadingRef.current = null;
    junctionLockRef.current = null;
    gyroTurnCandidateRef.current = null;
    setHeadsUpMode(false);
    setManualRotation((prev) => (prev - 90) % 360);
  }, []);

  const resetHeadingView = useCallback(() => {
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
  }, [defaultFacingDeg, userBeamRef]);

  const clearHeading = useCallback(
    (idleDeg) => {
      alignedHeadingRef.current = null;
      junctionLockRef.current = null;
      gyroTurnCandidateRef.current = null;
      setHeadsUpMode(false);
      setManualRotation(0);
      compassBaselineRef.current = null;
      deviceHeadingRef.current = 0;
      headingAtBaselineRef.current = idleDeg;
      userBeamRef.current?.setAttribute('transform', `rotate(${Math.round(idleDeg * 10) / 10})`);
    },
    [userBeamRef]
  );

  const applyTravelCourseBearing = useCallback(
    (travelBearing) => {
      if (!hasGyroSampleRef.current) {
        headingAtBaselineRef.current = travelBearing;
        userBeamRef.current?.setAttribute(
          'transform',
          `rotate(${Math.round(travelBearing * 10) / 10})`
        );
      }
    },
    [userBeamRef]
  );

  return {
    compassActive,
    mapRotationDeg,
    initialUserHeadingDeg,
    alignRouteOnce,
    toggleCompassAndRotation,
    rotateMapManual90,
    resetHeadingView,
    clearHeading,
    applyTravelCourseBearing,
  };
}
