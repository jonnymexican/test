# Get Inspired App

A small React app that shows an inspirational quote — bootstrapped with [Create React App](https://github.com/facebook/create-react-app), now powered by [Vite](https://vite.dev/).

## Getting started

```bash
npm install
npm start        # start the dev server (http://localhost:3000)
```

## Available Scripts

In the project directory, you can run:

### `npm start` / `npm run dev`

Runs the app in development mode with Vite's instant HMR.
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### `npm test`

Runs the unit tests once with [Vitest](https://vitest.dev/). Use `npm run test:watch` for watch mode.

### `npm run build`

Builds the app for production to the `build` folder.
The build is minified and the filenames include the hashes.

### `npm run preview`

Serves the production build locally so you can check it before deploying.

## Project structure

```
index.html          # Vite entry point
src/
  index.jsx         # React root
  App.jsx           # Top-level layout
  InspirationGenerator.jsx  # Quote state + "Inspire me again" button
  FancyText.jsx     # Title/quote typography
  Copyright.jsx
  quotes.js
  App.test.jsx      # Vitest + Testing Library tests
  setupTests.js
public/             # Static assets served at the site root
vite.config.mjs     # Vite + Vitest config
```

## Learn more

- [Vite documentation](https://vite.dev/guide/)
- [React documentation](https://react.dev/)
- [Vitest documentation](https://vitest.dev/guide/)
