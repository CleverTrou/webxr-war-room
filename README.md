# WebXR Incident War Room

A WebXR virtual reality environment for managing IT Major Incidents.
Built with [Three.js](https://threejs.org/) and the WebXR API — no build step required.

![Phase 1](https://img.shields.io/badge/phase-1%20%E2%80%93%20prototype-blue)

## What it does (Phase 1)

- **5 information panels** arranged in a semicircle: Incident Status, Active Responders, Action Items, Incident Timeline, and Service Monitoring
- **Teleportation** — cyan glowing rings on the floor; point a controller and pull the trigger (VR) or click (desktop)
- **Desktop fallback** — mouse-look camera with pointer lock
- **Mock ServiceNow data** — realistic P1 incident scenario

## Quick start

### Option A — GitHub Pages (easiest for Quest 2)

1. Push this repo to GitHub.
2. Go to **Settings → Pages** and set source to `main` branch, root folder.
3. The site will be available at `https://<user>.github.io/webxr-war-room/`.
4. Open that URL in your Quest 2 browser and tap **Enter VR**.

### Option B — Local development

```bash
# Any static file server works. `serve` is convenient:
npx serve . --cors -l 8080
```

Open `http://localhost:8080` in a browser.

> **Note:** WebXR requires a secure context (HTTPS or localhost).
> Quest 2 will only show the Enter VR button over HTTPS.
> For local testing on Quest 2, generate a self-signed cert and run:
> ```bash
> npx serve . --cors -l 8080 --ssl-cert cert.pem --ssl-key key.pem
> ```

## Project structure

```
webxr-war-room/
├── index.html          ← entry point (loads Three.js via importmap)
├── src/
│   ├── main.js         ← scene, camera, WebXR, teleportation, desktop controls
│   ├── panels.js       ← canvas-texture renderers for each info panel
│   └── mock-data.js    ← sample incident, responders, tasks, timeline, monitoring
├── package.json        ← dev-server scripts (optional)
├── .gitignore
└── README.md
```

## Controls

| Context | Action |
|---------|--------|
| **Desktop** | Click canvas to lock mouse → move mouse to look around |
| **Desktop** | Click a cyan ring to teleport |
| **Desktop** | Press `Esc` to release mouse |
| **Quest 2** | Click **Enter VR** button |
| **Quest 2** | Point controller at cyan floor ring → pull trigger to teleport |

## Roadmap

| Phase | Features |
|-------|----------|
| **1 ✓** | Static panels, teleportation, mock data, desktop + VR |
| **2** | Interactive HTML panels (clickable buttons, scrollable text) |
| **3** | ServiceNow REST API integration (live incident data) |
| **4** | Multi-user — WebRTC audio, avatar presence, join notifications |
| **5** | Screen sharing, spatial audio, role-based views |

## Technology

- **Three.js r170** — 3D rendering (loaded via CDN importmap, no bundler)
- **WebXR Device API** — VR session, controllers
- **Canvas 2D** — panel content rendered to textures
- **ServiceNow REST API** — planned for Phase 3

## License

MIT
