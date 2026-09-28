// Share Target intake. When the installed PWA receives something from the
// OS share sheet, Android lands it on start_url as ?title=&text=&url=.
// From that soup we extract the one thing that matters: map coordinates.
// Google Maps and OpenStreetMap links carry lat/lng in several shapes;
// everything else degrades to "a label we can show, but no place to go".

function firstParams(params) {
  return params.get('text') || params.get('title') || '';
}

/**
 * Pull a shared place out of share-target query params.
 * @param {URLSearchParams} params the start_url query
 * @returns {{coords:{lat:number,lng:number}|null, label:string, source:string}|null}
 *   null when the share holds nothing usable at all.
 */
export function parseShareTarget(params) {
  const urlRaw = params.get('url') || '';
  const text = params.get('text') || '';
  const title = params.get('title') || '';

  let source = null;
  let coords = null;
  let label = '';

  if (urlRaw) {
    source = 'url';
    const at = urlRaw.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/); // Google @lat,lng[,zoom]
    const q = urlRaw.match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/); // Google ?q=lat,lng
    const osm = urlRaw.match(/#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/); // OSM #map=z/lat/lng
    if (at) {
      coords = { lat: Number(at[1]), lng: Number(at[2]) };
    } else if (q) {
      coords = { lat: Number(q[1]), lng: Number(q[2]) };
      source = 'q';
    } else if (osm) {
      coords = { lat: Number(osm[1]), lng: Number(osm[2]) };
    } else {
      try {
        const shared = new URL(urlRaw);
        const inner = shared.searchParams.get('q');
        if (inner && inner !== urlRaw) {
          label = inner; // ?q=Place+Name style link
          source = 'q';
        }
      } catch {
        // not a parseable URL — fall through to text/title below
      }
    }
  }

  if (!coords && !label && (text || title)) {
    const bare = firstParams(params).match(/(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (bare) {
      coords = { lat: Number(bare[1]), lng: Number(bare[2]) };
      source = 'text';
    } else {
      label = text || title;
      source = 'text';
    }
  } else if (!label && (text || title)) {
    label = text || title;
  }

  if (!coords && !label) return null;
  return { coords, label: label.trim(), source: source ?? 'text' };
}
