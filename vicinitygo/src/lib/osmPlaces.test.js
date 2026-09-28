import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  categoryFor,
  nameFor,
  buildOverpassQuery,
  toPlaces,
  fetchRealPlaces,
} from './osmPlaces';

const ORIGIN = { lat: 47.6062, lng: -122.3321 };

const el = (id, lat, lng, tags) => ({ type: 'node', id, lat, lng, lon: lng, tags });

describe('osmPlaces', () => {
  it('maps OSM tags to vibes and icons', () => {
    expect(categoryFor({ amenity: 'cafe' })).toEqual({ vibe: 'food', icon: '☕' });
    expect(categoryFor({ leisure: 'park' })).toEqual({ vibe: 'nature', icon: '🌳' });
    expect(categoryFor({ tourism: 'artwork' })).toEqual({ vibe: 'culture', icon: '🎨' });
    expect(categoryFor({ historic: 'memorial' })).toEqual({ vibe: 'culture', icon: '🏛️' });
    expect(categoryFor({ amenity: 'bench' })).toEqual({ vibe: 'secret', icon: '🪑' });
    expect(categoryFor({ shop: 'books' })).toEqual({ vibe: 'secret', icon: '📖' });
    expect(categoryFor({ amenity: 'parking' })).toEqual({ vibe: 'secret', icon: '📍' });
    expect(categoryFor(undefined)).toEqual({ vibe: 'secret', icon: '📍' });
  });

  it('prefers real names, then brands, then evocative defaults', () => {
    expect(nameFor(el(1, 0, 0, { amenity: 'cafe', name: 'Cafe One' }))).toBe('Cafe One');
    expect(nameFor(el(2, 0, 0, { shop: 'coffee', brand: 'BeanCo' }))).toBe('BeanCo');
    expect(nameFor(el(3, 0, 0, { amenity: 'cafe' }))).toBe('Corner Espresso');
    expect(nameFor(el(4, 0, 0, { amenity: 'bench' }))).toBe('A lone bench');
  });

  it('reads tags from the element when not passed separately', () => {
    expect(nameFor({ type: 'node', id: 9, tags: { amenity: 'cafe', name: 'Tagless Call' } })).toBe(
      'Tagless Call'
    );
  });

  it('builds an Overpass query around the origin', () => {
    const q = buildOverpassQuery(ORIGIN, 1.4);
    // The radius alone is not enough — `around` must carry the center coords,
    // or Overpass silently returns zero elements.
    expect(q).toContain('around:1400,47.606200,-122.332100');
    expect(q).toContain('[out:json]');
    expect(q).toContain('out body 60;');
  });

  it('dedupes places per icon (keeping the nearest) and sorts nearest first', () => {
    const places = toPlaces(ORIGIN, [
      el(1, ORIGIN.lat + 0.002, ORIGIN.lng, { amenity: 'cafe', name: 'Far Cafe' }),
      el(2, ORIGIN.lat + 0.001, ORIGIN.lng, { amenity: 'cafe', name: 'Near Cafe' }),
      el(3, ORIGIN.lat + 0.0015, ORIGIN.lng + 0.001, { leisure: 'park', name: 'Park' }),
      el(4, ORIGIN.lat, ORIGIN.lng, { amenity: 'cafe', name: 'At your feet' }),
      { type: 'way', id: 5, lat: ORIGIN.lat + 0.003, lng: ORIGIN.lng, lon: ORIGIN.lng, tags: { amenity: 'pub', name: 'Way Pub' } }, // wrong type
    ]);
    expect(places.map((p) => p.name)).toEqual(['Near Cafe', 'Park']);
    expect(places[0].distanceMeters).toBeLessThan(places[1].distanceMeters);
    expect(places[0].id).toBe('osm-node-2');
  });

  it('tries the second Overpass endpoint when the first fails', async () => {
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        calls.push(String(url));
        if (String(url).includes('overpass-api.de')) {
          return Promise.resolve({ ok: false, status: 504 });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [
                el(1, ORIGIN.lat + 0.001, ORIGIN.lng, { amenity: 'cafe', name: 'Cafe' }),
                el(2, ORIGIN.lat + 0.002, ORIGIN.lng, { amenity: 'pub', name: 'Pub' }),
                el(3, ORIGIN.lat + 0.003, ORIGIN.lng, { amenity: 'library', name: 'Library' }),
                el(4, ORIGIN.lat + 0.004, ORIGIN.lng, { leisure: 'park', name: 'Park' }),
                el(5, ORIGIN.lat + 0.005, ORIGIN.lng, { tourism: 'artwork', name: 'Mural' }),
                el(6, ORIGIN.lat + 0.006, ORIGIN.lng, { amenity: 'bench', name: 'Bench' }),
              ],
            }),
        });
      })
    );

    const places = await fetchRealPlaces(ORIGIN);
    expect(calls).toHaveLength(2);
    expect(places.length).toBeGreaterThanOrEqual(5);
  });

  it('throws when every endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    );
    await expect(fetchRealPlaces(ORIGIN)).rejects.toThrow();
  });

  it('throws when Overpass answers but the area is too empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ elements: [el(1, ORIGIN.lat + 0.01, ORIGIN.lng, { amenity: 'cafe', name: 'Lonely' })] }),
        })
      )
    );
    await expect(fetchRealPlaces(ORIGIN)).rejects.toThrow('too few places found');
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
