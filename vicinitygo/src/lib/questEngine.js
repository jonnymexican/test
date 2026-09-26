// Pure quest-generation engine. Given an origin and filters, it deterministically
// places landmarks around the origin and composes them into quests.
// Seeded PRNG so a generated district is stable for the same session seed.

import { distanceMeters, walkMinutes } from './geo';
import {
  VIBES, DURATIONS, CITIES, LANDMARKS, CHECKPOINT_TASKS, TASK_THINGS, QUEST_TEMPLATES, QUEST_KINDS,
} from './questCatalog';

export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const EARTH_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Offset origin by distance (metres) along a bearing (degrees). */
export function offsetLatLng(origin, meters, bearingDeg) {
  const d = meters / EARTH_M;
  const br = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** Route length ≈ 1.5× the mean checkpoint distance; rough walk time from that. */
function routeStats(checkpoints, origin) {
  const total = checkpoints.reduce((n, c) => n + distanceMeters(origin, c), 0) / checkpoints.length;
  const meters = Math.round(total * 1.5);
  return { distanceMeters: meters, walkMinutes: walkMinutes(meters) };
}

/**
 * Generate quests near origin.
 * @param {{lat:number, lng:number}} origin
 * @param {{vibe?:string, duration?:string, seed?:number}} opts
 */
export function generateQuests(origin, { vibe = 'all', duration = 'quick', seed = 1, city } = {}) {
  const rng = makeRng(seed);
  const cityName = city ?? pick(rng, CITIES).name;
  const templateRng = makeRng(seed ^ 0x9e3779b9);
  const durationSpec = DURATIONS.find((d) => d.id === duration) ?? DURATIONS[0];
  const vibeList = vibe === 'all' ? Object.keys(LANDMARKS) : [vibe];
  const quests = [];

  for (const vibeId of vibeList) {
    const pool = LANDMARKS[vibeId];
    const count = Math.min(3, pool.length);
    for (let qi = 0; qi < count; qi++) {
      const template = pick(templateRng, QUEST_TEMPLATES);
      const kind = pick(templateRng, QUEST_KINDS);
      const title = template.title.replace('{kind}', kind);
      const checkpointCount = Math.max(2, durationSpec.checkpoints - qi % 2);

      // Ring placement: spread bearings evenly, jitter radius by duration cap.
      const checkpoints = [];
      for (let ci = 0; ci < checkpointCount; ci++) {
        const bearing = (360 / checkpointCount) * ci + rng() * 40;
        const radius = (0.35 + rng() * 0.6) * durationSpec.maxKm * 1000;
        const spot = offsetLatLng(origin, radius, bearing);
        const landmark = pool[(qi + ci) % pool.length];
        checkpoints.push({
          id: `${vibeId}-${qi}-${ci}`,
          name: landmark.name,
          icon: landmark.icon,
          detail: landmark.detail,
          task: CHECKPOINT_TASKS[(qi * 2 + ci) % CHECKPOINT_TASKS.length]
            .replace('{thing}', pick(templateRng, TASK_THINGS))
            .replace('{count}', String(3 + Math.floor(templateRng() * 7))),
          lat: spot.lat,
          lng: spot.lng,
          done: false,
        });
      }

      const route = routeStats(checkpoints, origin);
      quests.push({
        id: `${vibeId}-${qi}`,
        vibe: vibeId,
        title,
        intro: template.intro,
        city: cityName,
        distanceMeters: route.distanceMeters,
        walkMinutes: route.walkMinutes,
        xp: 20 + checkpointCount * 10,
        checkpoints,
        done: false,
      });
    }
  }

  return quests.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Which generated city are we in? (For the "your district" label.) */
export function cityNameFor(origin, seed = 1) {
  return pick(makeRng(hashSeed(`${seed}:${Math.round(origin.lat)}:${Math.round(origin.lng)}`)), CITIES).name;
}

export function levelForXp(xp) {
  return Math.floor(xp / 100) + 1;
}

export function xpIntoLevel(xp) {
  return xp % 100;
}
