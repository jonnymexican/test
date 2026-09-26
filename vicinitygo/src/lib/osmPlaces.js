// Real places near you, via OpenStreetMap. Overpass API for places,
// Nominatim for the neighbourhood name. Both are free and CORS-enabled;
// every call degrades gracefully — the app falls back to fictional districts.

import { distanceMeters, bearingDegrees } from './geo';

export const OSM_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// OSM tag values → vicinityGo vibe + checkpoint icon.
const CATEGORY_MAP = {
  cafe: { vibe: 'food', icon: '☕' },
  restaurant: { vibe: 'food', icon: '🍽️' },
  bakery: { vibe: 'food', icon: '🥐' },
  pub: { vibe: 'night', icon: '🏮' },
  bar: { vibe: 'night', icon: '💫' },
  fast_food: { vibe: 'food', icon: '🥟' },
  ice_cream: { vibe: 'food', icon: '🍨' },
  marketplace: { vibe: 'food', icon: '🧺' },
  park: { vibe: 'nature', icon: '🌳' },
  garden: { vibe: 'nature', icon: '🌸' },
  playground: { vibe: 'nature', icon: '🛝' },
  water: { vibe: 'nature', icon: '🦆' },
  fountain: { vibe: 'nature', icon: '⛲' },
  library: { vibe: 'culture', icon: '📚' },
  museum: { vibe: 'culture', icon: '🖼️' },
  theatre: { vibe: 'culture', icon: '🎭' },
  artwork: { vibe: 'culture', icon: '🎨' },
  memorial: { vibe: 'culture', icon: '🏛️' },
  monument: { vibe: 'culture', icon: '🏛️' },
  church: { vibe: 'culture', icon: '⛪' },
  place_of_worship: { vibe: 'culture', icon: '⛪' },
  bench: { vibe: 'secret', icon: '🪑' },
  viewpoint: { vibe: 'secret', icon: '🌆' },
  steps: { vibe: 'secret', icon: '🪜' },
  community_centre: { vibe: 'culture', icon: '🏛️' },
  books: { vibe: 'secret', icon: '📖' },
};

const DEFAULT_ENTRY = { vibe: 'secret', icon: '📍' };

export function categoryFor(tags) {
  const t = tags || {};
  if (t.amenity && CATEGORY_MAP[t.amenity]) return CATEGORY_MAP[t.amenity];
  if (t.tourism && CATEGORY_MAP[t.tourism]) return CATEGORY_MAP[t.tourism];
  if (t.historic && CATEGORY_MAP[t.historic]) return CATEGORY_MAP[t.historic];
  if (t.leisure && CATEGORY_MAP[t.leisure]) return CATEGORY_MAP[t.leisure];
  if (t.shop && CATEGORY_MAP[t.shop]) return CATEGORY_MAP[t.shop];
  if (t.natural === 'water') return CATEGORY_MAP.water;
  if (t.highway && CATEGORY_MAP[t.highway]) return CATEGORY_MAP[t.highway];
  return DEFAULT_ENTRY;
}

/** Human name for an OSM element, with a fallback the mapper can dress up. */
export function nameFor(element, tags = element?.tags ?? {}) {
  const t = tags;
  if (t.name) return t.name;
  if (t.brand) return t.brand;
  if (t.operator) return t.operator;
  const cat = categoryFor(t);
  if (element.type === 'node' && t.amenity === 'bench') return 'A lone bench';
  return DEFAULT_NAMES[cat.icon] ?? 'Unnamed spot';
}

const DEFAULT_NAMES = {
  '☕': 'Corner Espresso',
  '🍽️': 'Somebody’s Kitchen',
  '🥐': 'Bakery Vent',
  '🏮': 'The Local Round',
  '💫': 'Neon Alley',
  '🥟': 'Dumpling Window',
  '🍨': 'Gelato Bench',
  '🧺': 'Market Stalls',
  '🌳': 'Pocket Park',
  '🌸': 'Wildflower Strip',
  '🛝': 'The Swing Set',
  '🦆': 'Duck Landing',
  '⛲': 'Clock Fountain',
  '📚': 'Tiny Library',
  '🖼️': 'Little Gallery',
  '🎭': 'The Old Stage',
  '🎨': 'Mural Corner',
  '🏛️': 'Heritage Plaque',
  '⛪': 'The Quiet Church',
  '🪑': 'Bench with a View',
  '🌆': 'Skyline Gap',
  '🪜': 'Old Steps',
  '📖': 'Little Free Library',
  '📍': 'Unmarked Spot',
};

/** Overpass QL: places within maxKm of origin, deduped by tag combo. */
export function buildOverpassQuery(origin, maxKm) {
  const around = `around:${Math.round(maxKm * 1000)}`;
  return `[out:json][timeout:15];
(
  node(${around})["amenity"~"cafe|restaurant|bakery|pub|bar|fast_food|ice_cream|marketplace|library|fountain|bench"];
  node(${around})["leisure"~"park|garden|playground"];
  node(${around})["tourism"~"artwork|viewpoint|museum"];
  node(${around})["historic"~"memorial|monument"];
  node(${around})["shop"="books"];
);
out body 60;`;
}

/** Turn raw Overpass elements into mapper-friendly places, nearest first.
 * At most one place per icon (the nearest) keeps checkpoint variety up. */
export function toPlaces(origin, elements) {
  const byIcon = new Map();
  for (const el of elements ?? []) {
    if (el.type !== 'node' || typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;
    const d = distanceMeters(origin, { lat: el.lat, lng: el.lon });
    if (d < 25) continue; // skip the place you're standing in
    const cat = categoryFor(el.tags);
    const existing = byIcon.get(cat.icon);
    if (existing && existing.distanceMeters <= d) continue;
    byIcon.set(cat.icon, {
      id: `osm-${el.type}-${el.id}`,
      name: nameFor(el, el.tags),
      icon: cat.icon,
      vibe: cat.vibe,
      lat: el.lat,
      lng: el.lon,
      distanceMeters: d,
      bearing: bearingDegrees(origin, { lat: el.lat, lng: el.lon }),
    });
  }
  return [...byIcon.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch real places. Tries each Overpass endpoint in turn; throws when all
 * fail so the caller can fall back to the fictional districts.
 */
export async function fetchRealPlaces(origin, { maxKm = 1.4 } = {}) {
  const query = buildOverpassQuery(origin, maxKm);
  let lastError = new Error('Overpass unavailable');

  for (const endpoint of OSM_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        { method: 'POST', body: `data=${encodeURIComponent(query)}` },
        15000
      );
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      const places = toPlaces(origin, json.elements);
      if (places.length >= 5) return places;
      lastError = new Error('too few places found');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Reverse-geocode the neighbourhood name; falls back to a generated one. */
export async function fetchPlaceName(origin, fallback) {
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${origin.lat}&lon=${origin.lng}`,
      { headers: { Accept: 'application/json' } },
      8000
    );
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const json = await res.json();
    const a = json.address ?? {};
    const name = a.neighbourhood || a.suburb || a.quarter || a.village || a.town || a.city;
    return name || fallback;
  } catch {
    return fallback;
  }
}
