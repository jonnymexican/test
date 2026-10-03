/**
 * The Gallery — pure helpers for the art viewer.
 *
 * Collections are GitHub releases in jonnymexican/art; each image asset is
 * one artwork. Captions ride on the asset's GitHub label. No DOM code lives
 * here, so the test suite (src/gallery.test.js) imports it directly.
 */

var IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

export function isImageName(name) {
  return IMAGE_RE.test(String(name));
}

/**
 * "IMG_2041.jpg" → "IMG 2041", "Sunrise.Oil.Study.2024" → "Sunrise Oil Study 2024".
 * Splits camelCase, clears dot/underscore/dash noise, keeps the rest.
 */
export function prettyName(name) {
  return String(name)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The asset's caption: its GitHub label, or the tidied filename. */
export function captionOf(asset) {
  var label = String(asset.label || '').trim();
  return label || prettyName(asset.name);
}

/** "3.4 MB" / "412 KB" — human-scaled, gallery-label sized. */
export function fmtSize(bytes) {
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1e3)) + ' KB';
}

/**
 * Releases → collections of artworks:
 *   [{ title, tag, images: [{ asset, src, caption, size }] }]
 * Releases with no image assets are dropped; images sort by filename.
 */
export function collectArtwork(releases) {
  var collections = [];
  (releases || []).forEach(function (rel) {
    var images = (rel.assets || [])
      .filter(function (a) {
        return isImageName(a.name);
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .map(function (a) {
        return { asset: a, src: a.browser_download_url, caption: captionOf(a), size: a.size || 0 };
      });
    if (images.length) {
      collections.push({ title: rel.name || rel.tag_name, tag: rel.tag_name, images: images });
    }
  });
  return collections;
}

/** Collections → one flat list, for the lightbox's ‹ › walk-through. */
export function allImages(collections) {
  return (collections || []).reduce(function (acc, c) {
    return acc.concat(c.images);
  }, []);
}
