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
  App.jsx           # Top-level layout + theme state
  InspirationGenerator.jsx  # Quote state, deep links (?q=), "Inspire me again" button
  QuoteOfDay.jsx    # Daily quote card (share actions)
  ShareMenu.jsx     # Share popover (email, copy, X, WhatsApp, Facebook, Instagram)
  Favorites.jsx     # Saved quotes list
  AddQuoteForm.jsx  # Add/edit/delete your own quotes
  FancyText.jsx     # Title/quote typography
  Copyright.jsx
  ThemeToggle.jsx   # Light/dark toggle
  dailyQuote.js     # Deterministic quote-of-the-day selection
  shareTarget.js    # Site URL + quote deep-link builder
  useTheme.js       # Persisted light/dark theme
  useFavorites.js   # Persisted favorites
  useQuotePool.js   # Quote pool + custom quotes
  quotes.js, jungQuotes.js
  App.test.jsx      # Vitest + Testing Library tests
  dailyQuote.test.js
  setupTests.js
public/             # Static assets served at the site root
vite.config.mjs     # Vite + Vitest config
```

## Learn more

- [Vite documentation](https://vite.dev/guide/)
- [React documentation](https://react.dev/)
- [Vitest documentation](https://vitest.dev/guide/)
