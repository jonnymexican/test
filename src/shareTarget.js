export const SITE_URL = 'https://jonnymexican.github.io/test/';

/**
 * Deep-link URL for a specific quote — `?q=` holds the quote text
 * (or the special value `daily` for the quote of the day).
 */
export function buildQuoteUrl(quote, { daily = false } = {}) {
  const url = new URL(SITE_URL);
  if (daily) {
    url.searchParams.set('q', 'daily');
  } else {
    url.searchParams.set('q', quote);
  }
  return url.toString();
}
