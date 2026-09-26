import { describe, it, expect } from 'vitest';
import { quoteOfDay } from './dailyQuote';
import quotes from './quotes';
import jungQuotes from './jungQuotes';

const ALL_QUOTES = [...quotes, ...jungQuotes];

describe('quoteOfDay', () => {
  it('returns a quote from the combined pool', () => {
    expect(ALL_QUOTES).toContain(quoteOfDay());
  });

  it('is deterministic within the same day', () => {
    const morning = quoteOfDay(new Date('2026-09-26T00:00:01Z'));
    const evening = quoteOfDay(new Date('2026-09-26T23:59:59Z'));

    expect(morning).toBe(evening);
  });

  it('is stable for a given date no matter when it is calculated', () => {
    const today = quoteOfDay(new Date('2026-09-26T12:00:00Z'));
    const remembered = quoteOfDay(new Date('2026-09-26T12:00:00Z'));

    expect(today).toBe(remembered);
  });

  it('uses UTC days, so local times around the UTC boundary can differ', () => {
    const utcNoon = quoteOfDay(new Date('2026-09-26T12:00:00Z'));
    const utcMidnight = quoteOfDay(new Date('2026-09-26T00:00:00Z'));
    const utcJustBeforeMidnight = quoteOfDay(new Date('2026-09-25T23:59:59Z'));

    expect(utcJustBeforeMidnight).not.toBe(utcNoon);
    // Same UTC day (in any timezone) always agrees:
    expect(quoteOfDay(new Date('2026-09-26T00:00:00+14:00'))).toBe(utcJustBeforeMidnight);
    expect(quoteOfDay(new Date('2026-09-26T00:00:00-12:00'))).toBe(utcNoon);
    expect(utcMidnight).toBe(utcNoon);
  });

  it('changes the quote on the next day', () => {
    const saturday = quoteOfDay(new Date('2026-09-26T12:00:00Z'));
    const sunday = quoteOfDay(new Date('2026-09-27T12:00:00Z'));

    expect(sunday).not.toBe(saturday);
  });

  it('spreads quotes across consecutive days rather than repeating one', () => {
    const picks = new Set(
      Array.from({ length: Math.min(14, ALL_QUOTES.length) }, (_, i) =>
        quoteOfDay(new Date(Date.UTC(2026, 8, 1 + i)))
      )
    );

    expect(picks.size).toBeGreaterThan(1);
  });
});
