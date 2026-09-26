import { describe, it, expect } from 'vitest';
import {
  makeRng, hashSeed, offsetLatLng, generateQuests, levelForXp, xpIntoLevel,
} from './questEngine';
import { distanceMeters, bearingDegrees, walkMinutes, formatDistance } from './geo';

const ORIGIN = { lat: 47.6062, lng: -122.3321 };

describe('geo', () => {
  it('measures zero distance to itself', () => {
    expect(distanceMeters(ORIGIN, ORIGIN)).toBe(0);
  });

  it('knows roughly how far a known pair is', () => {
    // Space Needle to Pike Place Market ≈ 950 m; allow generous tolerance.
    const needle = { lat: 47.6205, lng: -122.3493 };
    const market = { lat: 47.6097, lng: -122.3422 };
    const d = distanceMeters(needle, market);
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(1600);
  });

  it('gives cardinal bearings (north = 0, east = 90)', () => {
    expect(bearingDegrees(ORIGIN, { lat: ORIGIN.lat + 0.01, lng: ORIGIN.lng })).toBeCloseTo(0, 0);
    expect(bearingDegrees(ORIGIN, { lat: ORIGIN.lat, lng: ORIGIN.lng + 0.01 })).toBeCloseTo(90, 0);
  });

  it('formats distances and walk times sanely', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(800)).toBe(10);
  });
});

describe('seeded rng', () => {
  it('is reproducible for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('hashes text deterministically', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});

describe('offsetLatLng', () => {
  it('round-trips distance and bearing', () => {
    const spot = offsetLatLng(ORIGIN, 1000, 90);
    expect(distanceMeters(ORIGIN, spot)).toBeCloseTo(1000, -1);
    expect(bearingDegrees(ORIGIN, spot)).toBeCloseTo(90, 0);
  });
});

describe('generateQuests', () => {
  it('creates quests with checkpoints in range of the duration cap', () => {
    const quests = generateQuests(ORIGIN, { vibe: 'all', duration: 'quick', seed: 7 });
    expect(quests.length).toBeGreaterThan(0);
    for (const q of quests) {
      expect(q.checkpoints.length).toBeGreaterThanOrEqual(2);
      for (const c of q.checkpoints) {
        const d = distanceMeters(ORIGIN, c);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThanOrEqual(1.2 * 1000 + 1);
      }
      expect(q.xp).toBeGreaterThan(0);
      expect(q.walkMinutes).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed and origin', () => {
    const a = generateQuests(ORIGIN, { vibe: 'nature', duration: 'half', seed: 9 });
    const b = generateQuests(ORIGIN, { vibe: 'nature', duration: 'half', seed: 9 });
    expect(a).toEqual(b);
  });

  it('respects a single-vibe filter', () => {
    const quests = generateQuests(ORIGIN, { vibe: 'food', duration: 'quick', seed: 3 });
    expect(quests.length).toBeGreaterThan(0);
    quests.forEach((q) => expect(q.vibe).toBe('food'));
  });

  it('sorts quests nearest-first', () => {
    const quests = generateQuests(ORIGIN, { vibe: 'all', duration: 'quick', seed: 11 });
    const dists = quests.map((q) => q.distanceMeters);
    expect([...dists].sort((x, y) => x - y)).toEqual(dists);
  });
});

describe('progression math', () => {
  it('levels up every 100 XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(xpIntoLevel(240)).toBe(40);
  });
});
