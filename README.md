# BLE Indoor Navigation

An indoor room-finding prototype that combines a browser-based floor map with Bluetooth Low Energy (BLE) beacons. Choose a destination, set or detect your starting location, and follow a route through the corridor. The web app is installable as a Progressive Web App (PWA) and can keep its map and navigation interface available offline after it has been loaded and cached.

> **Project status:** The current map models one floor with six rooms (No. 300–305). BLE-based positioning is an estimate based on signal strength; it is not a precision positioning system.

## What’s in the repository

| Path | Purpose |
| --- | --- |
| [`BLE_Navigation_With_Map/`](BLE_Navigation_With_Map/) | React + Vite web app, interactive map, routing, BLE scanning, and PWA setup |
| [`BLE_Becon/`](BLE_Becon/) | Arduino sketches for two BLE beacon examples |
| [`indoor_nav_start_change.html`](indoor_nav_start_change.html) | Standalone HTML project artifact |

The application map and room data are currently defined in `BLE_Navigation_With_Map/src/App.jsx`. The reusable route and positioning calculations are in `BLE_Navigation_With_Map/src/utils/indoorNavigation.js`.

## Get started

### Requirements

- Node.js **20.19+** or **22.12+**, and npm
- A modern browser; use Chrome or Edge for Web Bluetooth
- For live BLE scanning: a device with Bluetooth, plus HTTPS or `localhost`

### Run the web app

From the repository root:

```bash
cd BLE_Navigation_With_Map
npm install
npm run dev
```

Open the local URL printed by Vite. You can explore the map and routes without any beacons.

### Available commands

Run these from `BLE_Navigation_With_Map/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create the production PWA build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run icons` | Regenerate the app icons in `public/icons/` |

## Use the navigation app

1. Choose a room on the map or from the Rooms list to set your destination.
2. Set your current position manually using the location controls, or open the beacon controls and connect to a beacon.
3. Follow the route and turn guidance shown by the app. You can use manual positioning without BLE hardware.
4. On a supported phone, enable compass tracking if you want the on-screen direction indicator to follow your device heading.

The route is calculated over a graph of corridor junctions and room doorways. The app updates the route from the selected or estimated position and provides distance and walking-time guidance.

## Set up the example BLE beacons

The sketches in `BLE_Becon/beacon_1/` and `BLE_Becon/beacon_2/` are ESP32-style Arduino BLE advertiser examples. They currently broadcast the names **No. 300** and **No. 305**, respectively, and use this service UUID:

```text
12345678-1234-1234-1234-1234567890ab
```

To try them:

1. Open a sketch in the Arduino IDE with an ESP32 board package that provides `BLEDevice.h` and `BLEServer.h`.
2. Select your board and port, then upload the sketch to a compatible board.
3. Power on the board and grant the browser permission when selecting or scanning for the beacon.

To represent another room, change the beacon name in the sketch to match the room and keep its service UUID consistent with the app. The app recognizes room names for No. 300–305 (and the configured aliases `a01` and `b01`). Add or reposition physical beacons for your building as needed.

### BLE and positioning limitations

- Web Bluetooth is supported in Chromium-based browsers such as Chrome and Edge, but is not available in iOS Safari.
- Bluetooth access requires a secure context: HTTPS on a deployed site, or `localhost` during development.
- Signal strength (RSSI) varies with walls, people, device orientation, and beacon placement. Treat the displayed live position and distance as estimates; validate and calibrate them in the target building.
- The included beacon sketches advertise a room identity and service UUID. They do not provide surveyed coordinates or guarantee room-level accuracy.

## Offline use and deployment

The Vite PWA configuration uses Workbox to generate a service worker and precache the production app assets. Build and preview it locally:

```bash
npm run build
npm run preview
```

Open the preview in a browser, allow it to finish loading once, and then test by switching the browser to offline mode and reloading. The core map and routing are client-side, so they do not need a navigation server.

To deploy, publish the contents of `BLE_Navigation_With_Map/dist/` to a static host with HTTPS. HTTPS is required for PWA installation and BLE access. The current configuration expects the app at the domain root (`/`). For hosting under a subpath, update the Vite `base` setting and the PWA manifest URLs in `BLE_Navigation_With_Map/vite.config.js`.

## How it works

1. **Map and destinations:** the app renders the mapped floor and room destinations.
2. **Starting position:** choose a position manually or use authorized BLE beacons.
3. **BLE estimate:** received signal strengths are smoothed and converted to approximate distances to estimate a location on walkable paths.
4. **Route and guidance:** shortest-path routing follows the corridor graph to the selected room.
5. **PWA cache:** the service worker caches production assets so the app shell remains available offline after the first successful load.

## Development notes

- The app has no separate backend service; the current map, routes, and navigation logic run in the browser.
- No automated test script is defined in `package.json`. `npm run build` is the available production-build check.
- Generated dependencies, build output, and local environment files are excluded by the repository `.gitignore`.

## License

See [`LICENSE`](LICENSE).
