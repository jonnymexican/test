// Compose playable quests from real OSM places. Keeps the quest shapes and
// tasks from the catalog so real quests feel identical to generated ones —
// they just point at actual corners of your actual neighbourhood.

import { distanceMeters, walkMinutes } from './geo';
import { CHECKPOINT_TASKS, TASK_THINGS, QUEST_TEMPLATES, QUEST_KINDS } from './questCatalog';
import { makeRng } from './questEngine';

const VIBE_LABELS = {
  nature: 'Nature',
  culture: 'Culture',
  food: 'Food',
  night: 'Night',
  secret: 'Secrets',
};

const DURATION_QUESTS = { quick: 3, half: 4, long: 5 };
export const DURATION_MAX_KM = { quick: 1.4, half: 2.2, long: 3.5 };

function placeTask(place, rng) {
  return CHECKPOINT_TASKS[Math.floor(rng() * CHECKPOINT_TASKS.length)]
    .replace('{thing}', TASK_THINGS[Math.floor(rng() * TASK_THINGS.length)])
    .replace('{count}', String(3 + Math.floor(rng() * 7)));
}

function vibeDetail(place) {
  const t = place.tags ?? {};
  if (t.amenity === 'cafe') return 'Real espresso, real dollars — a flat white with a cult following.';
  if (t.leisure === 'park') return 'Real trees, real benches. Take the long way through.';
  if (t.tourism === 'artwork') return 'Someone made this with their whole chest. Go look.';
  if (t.amenity === 'bench') return 'The best seat in the neighbourhood, allegedly.';
  return 'A real place, marked by strangers who cared enough to map it.';
}

/**
 * Build quests from real places.
 * @param {Array} places nearest-first places from toPlaces()
 * @param {{lat:number,lng:number}} origin
 * @param {{city:string, duration:string, seed:number}} opts
 */
export function composeRealQuests(places, origin, { city, duration = 'quick', seed = 1 } = {}) {
  const checkpointCount = DURATION_QUESTS[duration] ?? 3;
  const rng = makeRng(seed);
  const templateRng = makeRng(seed ^ 0x9e3779b9);
  const quests = [];

  // Group places by vibe so each quest explores one flavour of the area.
  const byVibe = {};
  for (const p of places) (byVibe[p.vibe] ??= []).push(p);
  const vibes = Object.keys(byVibe)
    .filter((v) => byVibe[v].length >= 2)
    .sort((a, b) => byVibe[a][0].distanceMeters - byVibe[b][0].distanceMeters);

  for (const vibe of vibes) {
    const pool = byVibe[vibe];
    // Non-overlapping rotation through the vibe's pool.
    for (let qi = 0; qi * (checkpointCount - 1) < pool.length && qi < 3; qi++) {
      const chosen = [];
      for (let ci = 0; ci < checkpointCount; ci++) {
        const place = pool[(qi * (checkpointCount - 1) + ci) % pool.length];
        if (!chosen.includes(place)) chosen.push(place);
      }
      if (chosen.length < 2) continue;

      const template = QUEST_TEMPLATES[Math.floor(templateRng() * QUEST_TEMPLATES.length)];
      const kind = QUEST_KINDS[Math.floor(templateRng() * QUEST_KINDS.length)];
      const checkpoints = chosen.map((place, ci) => ({
        id: `${place.id}-${ci}`,
        name: place.name,
        icon: place.icon,
        detail: vibeDetail(place),
        task: placeTask(place, rng),
        lat: place.lat,
        lng: place.lng,
        bearing: place.bearing,
        distanceMeters: place.distanceMeters,
        done: false,
      }));

      const mean = checkpoints.reduce((n, c) => n + c.distanceMeters, 0) / checkpoints.length;
      const meters = Math.round(mean * 1.5);
      quests.push({
        id: `real-${vibe}-${qi}`,
        vibe,
        title: template.title.replace('{kind}', kind),
        intro: template.intro,
        city,
        distanceMeters: meters,
        walkMinutes: walkMinutes(meters),
        xp: 20 + checkpoints.length * 10,
        checkpoints,
        done: false,
        real: true,
      });
    }
  }

  return quests.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Label for the neighbourhood, from real data when we got it. */
export function vibeSummary(places) {
  const counts = {};
  for (const p of places) counts[p.vibe] = (counts[p.vibe] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([vibe, n]) => `${n} ${VIBE_LABELS[vibe] ?? vibe}`)
    .slice(0, 3)
    .join(' · ');
}
