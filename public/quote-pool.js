/**
 * The quote pool and the deterministic "quote of the day" picker.
 *
 * This file is the single source of truth: `src/quotes.js` and
 * `src/jungQuotes.js` re-export the arrays below, and Mission Control
 * imports the picker directly. It lives in `public/` because Mission
 * Control is a static page (public files are copied as-is, never bundled),
 * so app code must import *from* here — never copy the pool back out.
 */

export const quotes = [
  "Don’t let yesterday take up too much of today.” — Will Rogers",
  "Ambition is putting a ladder against the sky.",
  "A joy that's shared is a joy made double.",
  "The only way to do great work is to love what you do.” — Steve Jobs",
  "It always seems impossible until it’s done.” — Nelson Mandela",
  "Believe you can and you’re halfway there.” — Theodore Roosevelt",
  "The future belongs to those who believe in the beauty of their dreams.” — Eleanor Roosevelt",
  "Success is not final, failure is not fatal: it is the courage to continue that counts.” — Winston Churchill",
  "Act as if what you do makes a difference. It does.” — William James",
  "The best way to predict the future is to create it.” — Peter Drucker",
  "Start where you are. Use what you have. Do what you can.” — Arthur Ashe",
  "Hardships often prepare ordinary people for an extraordinary destiny.” — C.S. Lewis",
  "Dream big and dare to fail.” — Norman Vaughan",
  "It does not matter how slowly you go as long as you do not stop.” — Confucius",
];

export const jungQuotes = [
  "Who looks outside, dreams; who looks inside, awakes. — Carl Jung",
  "Until you make the unconscious conscious, it will direct your life and you will call it fate. — Carl Jung",
  "I am not what happened to me, I am what I choose to become. — Carl Jung",
  "Your vision will become clear only when you can look into your own heart. — Carl Jung",
  "The meeting of two personalities is like the contact of two chemical substances: if there is any reaction, both are transformed. — Carl Jung",
  "We cannot change anything until we accept it. Condemnation does not liberate, it oppresses. — Carl Jung",
  "Do not compare, do not measure. No other way is like yours. — Carl Jung",
  "The best political, social, and spiritual work we can do is to withdraw the projection of our shadow onto others. — Carl Jung",
  "Everything that irritates us about others can lead us to an understanding of ourselves. — Carl Jung",
  "Knowing your own darkness is the best method for dealing with the darknesses of other people. — Carl Jung",
  "The most terrifying thing is to accept oneself completely. — Carl Jung",
  "The privilege of a lifetime is to become who you truly are. — Carl Jung",
];

export const ALL_QUOTES = [...quotes, ...jungQuotes];

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
