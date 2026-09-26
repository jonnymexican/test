import quotes from './quotes';
import jungQuotes from './jungQuotes';

const ALL_QUOTES = [...quotes, ...jungQuotes];

function daysSinceEpoch(date) {
  // Use UTC so the same quote shows for everyone worldwide on each calendar day.
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000
  );
}

/**
 * Deterministic "quote of the day" — same quote for the whole day,
 * and the same quote for a given date no matter when it's calculated.
 */
export function quoteOfDay(date = new Date()) {
  const day = daysSinceEpoch(date);
  const hash =
    (day * 2654435761) % 4294967296; // Knuth multiplicative hash, spread evenly across days
  return ALL_QUOTES[hash % ALL_QUOTES.length];
}

export function todaysQuoteOfDay() {
  return quoteOfDay(new Date());
}
