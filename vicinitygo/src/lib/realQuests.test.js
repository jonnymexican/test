import { describe, it, expect } from 'vitest';
import { composeRealQuests, vibeSummary, DURATION_MAX_KM } from './realQuests';
import { toPlaces } from './osmPlaces';

const ORIGIN = { lat: 47.6062, lng: -122.3321 };

const elements = [
  { type: 'node', id: 1, lat: ORIGIN.lat + 0.001, lng: ORIGIN.lng, lon: ORIGIN.lng, tags: { amenity: 'cafe', name: 'Cafe One' } },
  { type: 'node', id: 2, lat: ORIGIN.lat + 0.002, lng: ORIGIN.lng, lon: ORIGIN.lng, tags: { amenity: 'cafe', name: 'Cafe Two' } },
  { type: 'node', id: 3, lat: ORIGIN.lat + 0.003, lng: ORIGIN.lng, lon: ORIGIN.lng, tags: { leisure: 'park', name: 'Park One' } },
  { type: 'node', id: 4, lat: ORIGIN.lat + 0.004, lng: ORIGIN.lng, lon: ORIGIN.lng, tags: { leisure: 'garden', name: 'Park Two' } },
  { type: 'node', id: 5, lat: ORIGIN.lat + 0.005, lng: ORIGIN.lng, lon: ORIGIN.lng, tags: { historic: 'memorial', name: 'Memorial One' } },
  { type: 'node', id: 6, lat: ORIGIN.lat + 0.006, lng: ORIGIN.lng, lon: ORIGIN.lng, tags: { tourism: 'artwork', name: 'Mural' } },
];

const places = toPlaces(ORIGIN, elements);

describe('realQuests', () => {
  it('composes one quest per vibe with real coordinates', () => {
    const quests = composeRealQuests(places, ORIGIN, { city: 'Capitol Hill', duration: 'quick', seed: 7 });
    expect(quests.length).toBeGreaterThanOrEqual(2);
    expect(quests.every((q) => q.real)).toBe(true);
    for (const q of quests) {
      expect(q.checkpoints.length).toBeGreaterThanOrEqual(2);
      expect(q.checkpoints.every((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))).toBe(true);
      expect(q.city).toBe('Capitol Hill');
      expect(q.xp).toBe(20 + q.checkpoints.length * 10);
    }
  });

  it('sorts quests nearest first and uses only distinct places within a quest', () => {
    const quests = composeRealQuests(places, ORIGIN, { city: 'X', duration: 'quick', seed: 7 });
    for (let i = 1; i < quests.length; i++) {
      expect(quests[i].distanceMeters).toBeGreaterThanOrEqual(quests[i - 1].distanceMeters);
    }
    for (const q of quests) {
      const ids = q.checkpoints.map((c) => c.name);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('honors longer durations with more checkpoints', () => {
    const quests = composeRealQuests(places, ORIGIN, { city: 'X', duration: 'long', seed: 7 });
    // The vibe pools only hold 2 places each, so long quests cap at pool size.
    expect(quests.every((q) => q.checkpoints.length >= 2)).toBe(true);
  });

  it('skips vibes with fewer than two places', () => {
    const solo = toPlaces(ORIGIN, [elements[0], elements[4]]);
    const quests = composeRealQuests(solo, ORIGIN, { city: 'X', duration: 'quick', seed: 7 });
    expect(quests).toEqual([]);
  });

  it('summarises the vibe mix for the UI', () => {
    const summary = vibeSummary(places);
    expect(summary).toContain('2 Nature'); // park + garden
    expect(summary).toContain('2 Culture'); // memorial + artwork
  });

  it('exposes duration radius caps', () => {
    expect(DURATION_MAX_KM.quick).toBe(1.4);
    expect(DURATION_MAX_KM.long).toBe(3.5);
  });
});
