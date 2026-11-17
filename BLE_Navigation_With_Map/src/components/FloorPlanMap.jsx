import './FloorPlanMap.css';
import {
  BUILDING_SHELL_POINTS,
  CORRIDOR_POINTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  ROOM_POLYGONS,
  nodes,
  rooms,
} from '../data/floorplanData.js';

/**
 * Full-screen interactive, pinch/pan/rotate SVG indoor floor plan with
 * counter-rotated labels, animated live route, destination pin, and user dot/beam.
 */
export default function FloorPlanMap({
  panelOpen,
  isGestureActive,
  transform,
  mapRotationDeg,
  counterRotation,
  svgRef,
  userGroupRef,
  userAccuracyRef,
  userBeamRef,
  routeCasingRef,
  routeLineRef,
  routeFlowRef,
  selectedRoomId,
  currentLocationNode,
  activeBeacons,
  renderedRoutePoints,
  renderedRouteStr,
  destPoint,
  userPoint,
  visualAccuracyPx,
  initialUserHeadingDeg,
  onPointerDown,
  onPointerMove,
  onPointerUpOrCancel,
  onWheel,
  onHallwayClick,
  onRoomPolygonClick,
}) {
  return (
    <main
      className={`map-viewport ${panelOpen ? 'panel-is-open' : 'panel-is-hidden'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUpOrCancel}
      onPointerCancel={onPointerUpOrCancel}
      onWheel={onWheel}
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
          onClick={onHallwayClick}
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
            onClick={onHallwayClick}
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
                onClick={(e) => onRoomPolygonClick(e, room)}
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
  );
}
