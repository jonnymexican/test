/**
 * Art Inspos — pure helpers for the abstract-art shuffle feed.
 *
 * Two key-free sources, both CORS-enabled from the browser:
 *   - Art Institute of Chicago open API (CC0 / public-domain works only;
 *     its best modern abstracts are copyrighted, so the pool is curated
 *     to the queries that actually yield public-domain hits)
 *   - Wikimedia Commons search (PD + CC-licensed files, license metadata
 *     read per file and filtered here)
 *
 * No DOM code lives here, so the test suite (src/inspo.test.js) imports
 * it directly.
 */

export const AIC_API = 'https://api.artic.edu/api/v1';
export const AIC_WEB = 'https://www.artic.edu';
export const IIIF = 'https://www.artic.edu/iiif/2';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

export const FIELDS = [
  'id',
  'title',
  'artist_title',
  'date_display',
  'image_id',
  'classification_title',
  'style_titles',
  'department_title',
  'medium_display',
  'color',
  'is_public_domain',
].join(',');

/**
 * AIC query strategies. Each is checked to yield public-domain hits on
 * its first pages — a plain q=abstract search mostly returns vases with
 * "abstract" in the description, and deep pages drift into unrelated
 * works, so the caller only randomizes over shallow pages (1–3).
 */
export const AIC_QUERIES = [
  'Vasily Kandinsky',
  'Wassily Kandinsky',
  'Piet Mondrian',
  'Robert Delaunay',
  'Sonia Delaunay',
  'Marsden Hartley',
  'color study',
  'geometric',
  'non-objective',
  'Der Blaue Reiter',
];

/**
 * Wikimedia Commons search terms. Commons carries both the pre-1931 PD
 * canon and modern CC-licensed abstraction, so these run wider than the
 * AIC list; the license filter in normalizeCommonsFile keeps every
 * showing legally clean either way.
 */
export const COMMONS_QUERIES = [
  'abstract painting',
  'abstract composition painting',
  'geometric abstract painting',
  'color field painting',
  'abstract expressionism painting',
  'abstract gouache acrylic painting',
  'non-objective painting',
  'Wassily Kandinsky painting',
  'Robert Delaunay painting',
  'Frantisek Kupka painting',
  'Sonia Delaunay painting',
  'Kazimir Malevich painting',
  'Piet Mondrian painting',
  'El Lissitzky construction',
  'Lyubov Popova painting',
  'abstract textile pattern',
];

/** Every strategy the feed draws from. */
export const STRATEGIES = []
  .concat(AIC_QUERIES.map((q) => ({ source: 'AIC', q: q })))
  .concat(COMMONS_QUERIES.map((q) => ({ source: 'Commons', q: q })));

/** AIC search URL for one strategy (public-domain flag rides as a field). */
export function searchUrl(strategy, page = 1, limit = 25) {
  const params = new URLSearchParams();
  if (strategy && strategy.q) params.set('q', strategy.q);
  params.set('limit', String(limit));
  params.set('page', String(page));
  params.set('fields', FIELDS);
  return AIC_API + '/artworks/search?' + params.toString();
}

/**
 * Wikimedia Commons search URL: image files only, with thumbnail and
 * license/author/date metadata in one round trip. `origin=*` enables CORS.
 */
export function commonsUrl(query, limit = 40, offset = 0) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: 'filetype:bitmap ' + query,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    gsroffset: String(offset),
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata|size',
    iiurlwidth: '1400',
  });
  return COMMONS_API + '?' + params.toString();
}

/** Strip wiki/HTML markup down to plain text. */
export function stripTags(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pull a usable date (\"1930\", \"1979-01-01\") out of Commons' messy values. */
export function cleanDate(s) {
  const text = stripTags(s);
  const m = text.match(/(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return text.slice(0, 24);
  const year = m[1];
  const month = m[2];
  const day = m[3];
  if (!month || month === '00' || month > '12') return year;
  if (!day || day === '00' || day > '31') return year + '-' + month;
  return year + '-' + month + '-' + day;
}

const LICENSE_OK = /^(public domain|pd[-\s]|cc0|cc[-\s]by)/i;
const LICENSE_BAD = /fair use|non-free|copyrighted/i;

/** Is this Commons LicenseShortName safe to display? (PD / CC0 / CC BY*) */
export function isUsableLicense(shortName) {
  const v = stripTags(shortName);
  if (!v || LICENSE_BAD.test(v)) return false;
  return LICENSE_OK.test(v);
}

/** IIIF full-width image URL for an AIC work. */
export function imageUrl(imageId, width = 1024) {
  return IIIF + '/' + imageId + '/full/' + width + ',/0/default.jpg';
}

/** AIC dominant color {h,s,l} → '#rrggbb' for tinting the page. */
export function hslToHex(h, s, l) {
  const hh = (((Number(h) % 360) + 360) % 360) / 360;
  const ss = Math.min(100, Math.max(0, Number(s) || 0)) / 100;
  const ll = Math.min(100, Math.max(0, Number(l) || 0)) / 100;
  const toHex = (x) => {
    const v = Math.round(Math.min(1, Math.max(0, x)) * 255);
    return v.toString(16).padStart(2, '0');
  };
  if (ss === 0) {
    const g = toHex(ll);
    return '#' + g + g + g;
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return '#' + toHex(hue(hh + 1 / 3)) + toHex(hue(hh)) + toHex(hue(hh - 1 / 3));
}

/**
 * Long Commons filenames make awful captions — keep the first clause when
 * there is a clean break, otherwise cut at a word boundary.
 */
export function tidyTitle(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!t) return 'Untitled';
  if (t.length <= 72) return t;
  const dash = t.indexOf(' - ');
  if (dash >= 12) return t.slice(0, dash).trim();
  return t.slice(0, 72).replace(/[\s,.;:]+\S*$/, '') + '…';
}

const ABSTRACT_RE =
  /abstract|non[- ]objective|color field|geometric|constructiv|supremat|de stijl|surreal|cubis|expressionis|biomorphic|automat|concret|orphism|synchrom|rythm|rhythm/i;

// Artists the feed queries by name — their work counts as abstract even
// when AIC's style tags say something narrower.
const KNOWN_ARTISTS = [
  'kandinsky',
  'mondrian',
  'kupka',
  'delaunay',
  'miró',
  'miro',
  'klee',
  'riley',
  'lissitzky',
  'popova',
  'hofmann',
  'kline',
  'arp',
  'exter',
  'albers',
  'malevich',
  'hartley',
];

/** Does this normalized artwork belong in an abstract feed? */
export function isAbstractish(art) {
  if (!art) return false;
  const haystack = []
    .concat(art.styles || [])
    .concat([art.classification || '', art.title || ''])
    .join(' ');
  if (ABSTRACT_RE.test(haystack)) return true;
  const artist = String(art.artist || '').toLowerCase();
  return KNOWN_ARTISTS.some((name) => artist.indexOf(name) !== -1);
}

/**
 * AIC API artwork → feed artwork, or null when it can't be shown
 * (no id / no image / not public domain).
 */
export function normalizeArtwork(raw) {
  if (!raw || raw.id == null || !raw.image_id) return null;
  if (raw.is_public_domain !== true) return null; // CC0 / open access only
  const color = raw.color || {};
  return {
    key: 'aic:' + raw.id,
    id: raw.id,
    source: 'AIC',
    license: 'CC0',
    title: raw.title || 'Untitled',
    artist: raw.artist_title || 'Unknown artist',
    date: raw.date_display || '',
    medium: raw.medium_display || '',
    classification: raw.classification_title || '',
    styles: Array.isArray(raw.style_titles) ? raw.style_titles : [],
    imageUrl: imageUrl(raw.image_id),
    pageUrl: AIC_WEB + '/artworks/' + raw.id,
    accent: isFinite(color.h) ? hslToHex(color.h, color.s, color.l) : null,
  };
}

/** AIC response list → feed artworks: normalized, filtered, de-duplicated. */
export function normalizeList(rawList) {
  const seen = new Set();
  const out = [];
  (rawList || []).forEach((raw) => {
    const art = normalizeArtwork(raw);
    if (!art || seen.has(art.key) || !isAbstractish(art)) return;
    seen.add(art.key);
    out.push(art);
  });
  return out;
}

/**
 * Commons generator page → feed artwork, or null: not an image, too small,
 * SVG (diagrams, not art), or a license we may not display.
 */
export function normalizeCommonsFile(page) {
  if (!page || page.pageid == null || !page.imageinfo || !page.imageinfo[0]) return null;
  const ii = page.imageinfo[0];
  if (!ii.mime || ii.mime.indexOf('image/') !== 0) return null;
  if (ii.mime === 'image/svg+xml') return null;
  if ((Number(ii.width) || 0) < 500) return null;
  const em = ii.extmetadata || {};
  const license = stripTags(em.LicenseShortName && em.LicenseShortName.value);
  if (!isUsableLicense(license)) return null;
  const fromMeta = stripTags(em.ObjectName && em.ObjectName.value)
    .split(/\s+(?:title|label)\s+QS:/i)[0] // wiki fact-tracking junk
    .trim();
  const fromFile = String(page.title || '')
    .replace(/^File:/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    key: 'commons:' + page.pageid,
    id: page.pageid,
    source: 'Commons',
    license: license,
    title: tidyTitle(fromMeta || fromFile),
    artist: stripTags(em.Artist && em.Artist.value) || 'Unknown artist',
    date: cleanDate(em.DateTimeOriginal && em.DateTimeOriginal.value),
    medium: '',
    classification: '',
    styles: [],
    imageUrl: ii.thumburl || ii.url,
    pageUrl: ii.descriptionurl || 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(String(page.title || '')),
    accent: null,
  };
}

/** Commons response pages → feed artworks: filtered and de-duplicated. */
export function normalizeCommonsList(pages) {
  const seen = new Set();
  const out = [];
  Object.values(pages || {}).forEach((page) => {
    const art = normalizeCommonsFile(page);
    if (!art || seen.has(art.key)) return;
    seen.add(art.key);
    out.push(art);
  });
  return out;
}

/** Fisher-Yates shuffle into a new array (original untouched). */
export function shuffle(items, rng = Math.random) {
  const out = (items || []).slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
