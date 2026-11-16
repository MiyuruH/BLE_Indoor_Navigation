# Indoor Navigation – Smart Room Tracker (PWA)

BLE-based indoor navigation with an interactive campus map, built with React + Vite.
The app is a **Progressive Web App (PWA)**: users can install it on their phone/laptop
and use it **fully offline** (no internet connection needed after the first visit).

## Scripts

```bash
npm install        # install dependencies
npm run dev        # development server (service worker disabled in dev)
npm run build      # production build -> dist/ (generates sw.js + manifest)
npm run preview    # serve the production build locally to test the PWA
npm run icons      # regenerate the app icons in public/icons/
```

## How offline mode works

- `vite-plugin-pwa` (Workbox) generates a service worker at build time that **precaches
  every file** of the app (HTML, JS, CSS, icons).
- After the first load, the app opens instantly from device storage, even in airplane mode.
- The map, rooms, routing and BLE logic all run on the device, so nothing needs the internet.
- When a new version is deployed, users see an **"A new version is available → Update"** toast.
- An **"Offline mode"** badge appears at the top when the device has no connection.

## Installing the app

| Platform | How |
| --- | --- |
| Android (Chrome/Edge) | Tap the **⬇ Install App** button, or browser menu → *Install app* |
| Windows / macOS / Linux (Chrome/Edge) | Install icon in the address bar, or the **⬇ Install App** button |
| iPhone / iPad (Safari) | Share → **Add to Home Screen** (tap *Install App* for a hint) |

> **Note:** Web Bluetooth (beacon scanning) is only supported in Chromium browsers
> (Chrome / Edge) on Android, Windows, macOS, Linux and ChromeOS. iOS Safari does not
> support Web Bluetooth, so on iPhone the map works but BLE scanning will not.

## Deployment requirements

- PWAs and Web Bluetooth **require HTTPS** (or `http://localhost`). Deploy `dist/` to any
  static HTTPS host – e.g. Netlify, Vercel, GitHub Pages, Firebase Hosting.
- The app is configured for hosting at the domain root (`/`). If you host under a
  sub-path (e.g. GitHub Pages `/repo-name/`), set `base: '/repo-name/'` in
  `vite.config.js` and update `start_url`/`scope` in the manifest accordingly.

## Testing offline locally

1. `npm run build && npm run preview`
2. Open the URL in Chrome → DevTools → **Application** → check *Manifest* and *Service Workers*.
3. In DevTools → **Network**, choose *Offline* and reload – the app still works.
