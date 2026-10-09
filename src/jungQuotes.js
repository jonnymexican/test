// The pool lives in public/quote-pool.js so Mission Control (a static page)
// can show the same quote of the day — this file just re-exports it.
export { jungQuotes as default } from '../public/quote-pool.js';
