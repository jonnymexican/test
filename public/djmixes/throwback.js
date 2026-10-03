/**
 * Throwback Radio — pure helpers for the DJ Vault player.
 *
 * Mixes carry dates in their filenames ("20080501", "05-01-2008",
 * "2008-5-1"). These functions pull the dates out and pick the mix
 * closest to "today" across all the years. No DOM code lives here, so
 * the test suite (src/throwback.test.js) imports it directly.
 */

var AUDIO_RE = /\.(mp3|wav|flac|m4a|ogg|aiff|aif)$/i;

// 20080501 — compact YYYYMMDD.
var YMD_COMPACT = /(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/;
// 2008-5-1 / 2008.05.01
var YMD_DASHED = /(?<!\d)(20\d{2})[-.](0?[1-9]|1[0-2])[-.](0?[1-9]|[12]\d|3[01])(?!\d)/;
// 05-01-2008 / 5.1.2008 (US month-day-year)
var MDY_DASHED = /(?<!\d)(0?[1-9]|1[0-2])[-.](0?[1-9]|[12]\d|3[01])[-.](20\d{2})(?!\d)/;

export function isAudioName(name) {
  return AUDIO_RE.test(name);
}

/** Filename → UTC timestamp of the first date found in it, or null. */
export function extractDate(name) {
  var s = String(name);
  var m = s.match(YMD_COMPACT) || s.match(YMD_DASHED);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(MDY_DASHED);
  if (m) return validDate(+m[3], +m[1], +m[2]); // month, day, year
  return null;
}

function validDate(y, mo, d) {
  var t = Date.UTC(y, mo - 1, d);
  var dt = new Date(t);
  // Round-trip check rejects impossible dates like Feb 30.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return t;
}

/**
 * "Jonathan.Voigt.-.Basement.Mix.-.02.-.08-09-2008.mp3"
 *   → "Jonathan Voigt — Basement Mix — 02 — 08-09-2008"
 * Keeps date hyphens, splits camelCase, clears the dot-noise GitHub adds.
 */
export function prettyName(name) {
  var GUARD = '\u0001';
  var s = String(name).replace(/\.[a-z0-9]+$/i, '');
  s = s.replace(/\s*\.\s*-\s*\.\s*/g, ' — ');
  s = s.replace(/\s+-\s+/g, ' — ');
  // Protect date hyphens (08-09-2008) from the general dash split below.
  s = s.replace(/(?<!\d)(\d{1,4})-(\d{1,2})-(\d{1,4})(?!\d)/g, function (m) {
    return m.replace(/-/g, GUARD);
  });
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/-/g, ' ');
  s = s.split(GUARD).join('-');
  s = s.replace(/[._]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Day-of-year ordinal on a fixed leap year (2000) so every month/day has a
// stable number: Jan 1 → 0 … Dec 31 → 365.
function ordinal(t) {
  var d = new Date(t);
  return Math.round((Date.UTC(2000, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2000, 0, 1)) / 86400000);
}

var DAYS = 366;

function wrapDistance(a, b) {
  var d = Math.abs(a - b);
  return Math.min(d, DAYS - d); // Dec 31 is 1 day from Jan 1
}

function better(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

/**
 * Pick the mix closest to today's month/day across all years.
 * Exact month/day matches win; ties go to the newest year, then the name.
 * Returns { release, asset, at, distance, isExactDate } or null.
 */
export function pickThrowback(releases, now) {
  var cands = [];
  (releases || []).forEach(function (rel) {
    (rel.assets || []).forEach(function (a) {
      if (!isAudioName(a.name)) return;
      var t = extractDate(a.name);
      if (t !== null) cands.push({ release: rel, asset: a, at: t });
    });
  });
  if (!cands.length) return null;
  var todayOrd = ordinal((now || new Date()).getTime());
  var best = null;
  var bestScore = null;
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    var dist = wrapDistance(ordinal(c.at), todayOrd);
    var year = new Date(c.at).getUTCFullYear();
    var score = [dist, -year, c.asset.name];
    if (!best || better(score, bestScore)) {
      best = { release: c.release, asset: c.asset, at: c.at, distance: dist, isExactDate: dist === 0 };
      bestScore = score;
    }
  }
  return best;
}

/** "Saturday, August 9, 2008" (locale-formatted, UTC-safe). */
export function formatDate(t) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(t));
}

/** "18 years ago today" / "a year ago today" / "earlier this year". */
export function yearsAgoText(t, now) {
  var years = (now || new Date()).getUTCFullYear() - new Date(t).getUTCFullYear();
  if (years <= 0) return 'earlier this year';
  if (years === 1) return 'a year ago today';
  return years + ' years ago today';
}
