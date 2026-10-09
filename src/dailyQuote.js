// Single source of truth lives in public/quote-pool.js: the same module
// Mission Control imports, so the app and the console always agree on
// today's quote. The API here is unchanged (quoteOfDay / todaysQuoteOfDay).
export { ALL_QUOTES, quoteOfDay, todaysQuoteOfDay } from '../public/quote-pool.js';
