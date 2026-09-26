# vicinityGo

Micro-adventures within walking distance. Pick a vibe and how long you have,
and vicinityGo generates small quests — checkpoints with tiny real-world tasks —
near your location. Complete them at your own pace, earn XP, level up.

No accounts, no ads, no backend, no API keys. Everything runs in the browser
and progress stays on the device.

## Features

- **Quest generation** — seeded, deterministic quests placed by real compass
  bearing and distance around your location (or a picked district, if you
  decline location access).
- **Radar view** — checkpoints plotted on a compass radar, no map tiles needed.
- **Progression** — XP per quest, levels every 100 XP, progress persisted in
  `localStorage`.
- **PWA** — installable on a phone, works offline (service worker + manifest).

## Run locally

```bash
npm install
npm run dev        # http://localhost:3001
npm test           # unit + integration tests
npm run build      # production build in dist/
```

## Deployed

The app is published at
[https://jonnymexican.github.io/test/vicinitygo/](https://jonnymexican.github.io/test/vicinitygo/)
as part of the parent project.

## Tech

React 19 · Vite · Vitest + Testing Library. No runtime dependencies beyond
React.
