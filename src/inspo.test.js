import { describe, it, expect } from 'vitest';
import {
  searchUrl,
  commonsUrl,
  hslToHex,
  imageUrl,
  stripTags,
  cleanDate,
  tidyTitle,
  isUsableLicense,
  supportKind,
  isAbstractish,
  normalizeArtwork,
  normalizeList,
  normalizeCommonsFile,
  normalizeCommonsList,
  shuffle,
} from '../public/inspo/inspo.js';

const raw = (over = {}) => ({
  id: 123,
  title: 'Composition VII',
  artist_title: 'Wassily Kandinsky',
  date_display: '1913',
  image_id: 'abc-123',
  classification_title: 'painting',
  style_titles: ['Abstract'],
  medium_display: 'oil on canvas',
  color: { h: 210, s: 40, l: 55 },
  is_public_domain: true,
  ...over,
});

const commonsFile = (over = {}) => ({
  pageid: 555,
  title: 'File:Blue Composition, 1923.jpg',
  imageinfo: [
    {
      mime: 'image/jpeg',
      width: 1400,
      thumburl: 'https://upload.wikimedia.org/w/x/Blue_1400.jpg',
      url: 'https://upload.wikimedia.org/w/x/Blue.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Blue_Composition,_1923.jpg',
      extmetadata: {
        LicenseShortName: { value: 'Public domain' },
        Artist: { value: '<b>Robert Delaunay</b>' },
        DateTimeOriginal: { value: '1923date QS:P571,+1923-00-00T00:00:00Z/9' },
        ObjectName: { value: 'Blue Composition' },
      },
    },
  ],
  ...over,
});

describe('searchUrl (AIC)', () => {
  it('builds an AIC search requesting the fields the feed reads', () => {
    const url = searchUrl({ q: 'color field' }, 4, 25);
    expect(url).toContain('api.artic.edu/api/v1/artworks/search');
    expect(url).toContain('q=color+field');
    expect(url).toContain('page=4');
    expect(url).toContain('limit=25');
    expect(url).toContain('image_id');
    expect(url).toContain('is_public_domain'); // as a field, not a second term clause
    expect(url).not.toContain('query%5Bterm%5D'); // stacked term clauses 400 the API
  });
});

describe('commonsUrl', () => {
  it('searches image files with metadata and CORS enabled', () => {
    const url = commonsUrl('abstract painting', 40, 80);
    expect(url).toContain('commons.wikimedia.org/w/api.php');
    expect(url).toContain('generator=search');
    expect(url).toContain('filetype%3Abitmap+abstract+painting');
    expect(url).toContain('gsrlimit=40');
    expect(url).toContain('gsroffset=80');
    expect(url).toContain('origin=*');
    expect(url).toContain('extmetadata');
  });
});

describe('metadata cleanup', () => {
  it('stripTags flattens markup to plain text', () => {
    expect(stripTags('<b>Robert</b>  Delaunay\n')).toBe('Robert Delaunay');
    expect(stripTags(null)).toBe('');
  });

  it('cleanDate finds the date inside Commons noise', () => {
    expect(cleanDate('1930date QS:P571,+1930-00-00T00:00:00Z/9')).toBe('1930');
    expect(cleanDate('1979-01-01')).toBe('1979-01-01');
    expect(cleanDate('<i>undated</i>')).toBe('undated');
  });

  it('tidyTitle keeps captions readable', () => {
    expect(tidyTitle('Blue Composition')).toBe('Blue Composition');
    expect(
      tidyTitle("'Painting deaf' - free abstract expressionist watercolor painting in color lines - created by Dutch painter artist Fons Heijnsbroek in 2010. Free download modern art image in high resolutions TIFF")
    ).toBe("'Painting deaf'");
    expect(tidyTitle('Abstract gouache painting Abstract Landscape number one with no clean break in the middle of nowhere')).toBe('Abstract gouache painting Abstract Landscape number one with no clean…');
    expect(tidyTitle('')).toBe('Untitled');
    expect(tidyTitle(null)).toBe('Untitled');
  });

  it('isUsableLicense allows PD/CC0/CC BY and rejects the rest', () => {
    expect(isUsableLicense('Public domain')).toBe(true);
    expect(isUsableLicense('CC0')).toBe(true);
    expect(isUsableLicense('CC BY-SA 4.0')).toBe(true);
    expect(isUsableLicense('CC BY 3.0')).toBe(true);
    expect(isUsableLicense('Fair use')).toBe(false);
    expect(isUsableLicense('Non-free')).toBe(false);
    expect(isUsableLicense('')).toBe(false);
    expect(isUsableLicense(undefined)).toBe(false);
  });
});

describe('hslToHex', () => {
  it('converts pure hues', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });

  it('returns gray when saturation is 0', () => {
    expect(hslToHex(0, 0, 50)).toBe('#808080');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });

  it('clamps out-of-range input instead of producing garbage', () => {
    expect(hslToHex(360, 100, 50)).toBe('#ff0000'); // hue wraps
    expect(hslToHex(0, 999, -50)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('isAbstractish', () => {
  it('accepts abstract style tags, movements, and titles', () => {
    expect(isAbstractish({ styles: ['Abstract'], classification: 'painting' })).toBe(true);
    expect(isAbstractish({ styles: [], classification: 'Abstract Expressionism' })).toBe(true);
    expect(isAbstractish({ styles: ['Constructivism'], classification: '' })).toBe(true);
    expect(isAbstractish({ styles: [], classification: '', title: 'Abstract Composition' })).toBe(true);
  });

  it('rejects literal-minded matches and unknown artists', () => {
    expect(isAbstractish({ styles: [], classification: 'vessel', title: 'Hydria', artist: 'Ancient Greek' })).toBe(false);
    expect(isAbstractish({ styles: [], classification: 'painting', title: 'Self-portrait', artist: 'Vermeer' })).toBe(false);
    expect(isAbstractish(null)).toBe(false);
  });

  it('accepts the feed roster even under narrower style tags', () => {
    expect(isAbstractish({ styles: ['Bauhaus'], classification: 'design', title: 'Garden', artist: 'Paul Klee' })).toBe(true);
    expect(isAbstractish({ styles: [], classification: 'painting', title: 'Blow', artist: 'Bridget Riley' })).toBe(true);
  });

  it('matches the right Delaunays and not the 19th-century portraitist', () => {
    expect(isAbstractish({ styles: [], classification: '', title: 'Rythmes', artist: 'Robert Delaunay' })).toBe(true);
    expect(isAbstractish({ styles: [], classification: '', title: 'Portrait of Alphée Dubois', artist: 'Eugène Delaunay' })).toBe(false);
  });
});

describe('supportKind (canvas-only feed)', () => {
  it('recognises canvas and linen supports', () => {
    expect(supportKind('Oil on canvas')).toBe('canvas');
    expect(supportKind('oil on linen')).toBe('canvas');
    expect(supportKind('Acrylic on canvas')).toBe('canvas');
  });

  it('recognises non-canvas supports', () => {
    expect(supportKind('Gouache on paper')).toBe('other');
    expect(supportKind('lithograph')).toBe('other');
    expect(supportKind('oil on wood panel')).toBe('other');
    expect(supportKind('textile')).toBe('other');
  });

  it('reports unknown when no medium is stated', () => {
    expect(supportKind('')).toBe('unknown');
    expect(supportKind(undefined)).toBe('unknown');
    expect(supportKind('mixed media')).toBe('unknown');
  });
});

describe('normalizeArtwork (AIC)', () => {
  it('maps the API record to the feed shape', () => {
    const art = normalizeArtwork(raw());
    expect(art.key).toBe('aic:123');
    expect(art.source).toBe('AIC');
    expect(art.license).toBe('CC0');
    expect(art.title).toBe('Composition VII');
    expect(art.artist).toBe('Wassily Kandinsky');
    expect(art.imageUrl).toBe('https://www.artic.edu/iiif/2/abc-123/full/1024,/0/default.jpg');
    expect(art.pageUrl).toBe('https://www.artic.edu/artworks/123');
    expect(art.accent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('drops records that cannot be shown', () => {
    expect(normalizeArtwork(null)).toBeNull();
    expect(normalizeArtwork({ id: 1, is_public_domain: true, medium_display: 'Oil on canvas' })).toBeNull(); // no image
    expect(normalizeArtwork({ image_id: 'x', is_public_domain: true, medium_display: 'Oil on canvas' })).toBeNull(); // no id
    expect(normalizeArtwork(raw({ is_public_domain: false }))).toBeNull(); // not CC0
    expect(normalizeArtwork(raw({ medium_display: 'Gouache on paper' }))).toBeNull(); // not canvas
    expect(normalizeArtwork(raw({ medium_display: 'Lithograph on paper' }))).toBeNull(); // not canvas
  });

  it('fills sensible defaults for sparse records', () => {
    const art = normalizeArtwork({ id: 9, image_id: 'img', is_public_domain: true, medium_display: 'Oil on canvas' });
    expect(art.title).toBe('Untitled');
    expect(art.artist).toBe('Unknown artist');
    expect(art.accent).toBeNull();
    expect(art.styles).toEqual([]);
  });
});

describe('normalizeList (AIC)', () => {
  it('filters, drops imageless works, and de-duplicates by key', () => {
    const list = normalizeList([
      raw(),
      raw(), // duplicate id
      raw({ id: 2, image_id: null }), // no image
      raw({ id: 3, style_titles: [], classification_title: 'vessel', title: 'Hydria', artist_title: 'Ancient Greek' }), // not abstract
      raw({ id: 4, title: 'Blue 4', style_titles: ['Color field'] }),
    ]);
    expect(list.map((a) => a.id)).toEqual([123, 4]);
  });

  it('tolerates garbage input', () => {
    expect(normalizeList(undefined)).toEqual([]);
    expect(normalizeList([null, {}])).toEqual([]);
  });
});

describe('normalizeCommonsFile', () => {
  it('maps a Commons file to the feed shape with license and credit', () => {
    const art = normalizeCommonsFile(commonsFile());
    expect(art.key).toBe('commons:555');
    expect(art.source).toBe('Commons');
    expect(art.license).toBe('Public domain');
    expect(art.title).toBe('Blue Composition');
    expect(art.artist).toBe('Robert Delaunay');
    expect(art.date).toBe('1923');
    expect(art.imageUrl).toContain('1400');
    expect(art.pageUrl).toContain('commons.wikimedia.org');
  });

  it('falls back to the filename when metadata is missing', () => {
    const file = commonsFile();
    delete file.imageinfo[0].extmetadata.ObjectName;
    delete file.imageinfo[0].extmetadata.Artist;
    const art = normalizeCommonsFile(file);
    expect(art.title).toBe('Blue Composition, 1923');
    expect(art.artist).toBe('Unknown artist');
  });

  it('strips wiki label-tracking junk from ObjectName', () => {
    const file = commonsFile();
    file.imageinfo[0].extmetadata.ObjectName = {
      value: 'Landschap bij Uden title QS:P1476,en:"Landschap bij Uden" label QS:P1868,"listartist"',
    };
    expect(normalizeCommonsFile(file).title).toBe('Landschap bij Uden');
  });

  it('rejects non-canvas mediums but allows unstated ones', () => {
    const panel = commonsFile();
    panel.imageinfo[0].extmetadata.Medium = { value: 'oil on wood panel' };
    expect(normalizeCommonsFile(panel)).toBeNull();

    const onPaper = commonsFile();
    onPaper.title = 'File:Abstract acrylic on paper 04.jpg';
    expect(normalizeCommonsFile(onPaper)).toBeNull(); // title gives the game away

    const canvas = commonsFile();
    canvas.imageinfo[0].extmetadata.Medium = { value: 'oil on canvas' };
    expect(normalizeCommonsFile(canvas)).not.toBeNull();

    // no Medium metadata → the canvas-biased query terms carry the signal
    expect(normalizeCommonsFile(commonsFile())).not.toBeNull();
  });

  it('rejects unusable licenses, SVGs, tiny images, and broken records', () => {
    const fair = commonsFile();
    fair.imageinfo[0].extmetadata.LicenseShortName = { value: 'Fair use' };
    expect(normalizeCommonsFile(fair)).toBeNull();

    const svg = commonsFile();
    svg.imageinfo[0].mime = 'image/svg+xml';
    expect(normalizeCommonsFile(svg)).toBeNull();

    const tiny = commonsFile();
    tiny.imageinfo[0].width = 320;
    expect(normalizeCommonsFile(tiny)).toBeNull();

    expect(normalizeCommonsFile({ pageid: 1 })).toBeNull();
    expect(normalizeCommonsFile(null)).toBeNull();
  });
});

describe('normalizeCommonsList', () => {
  it('walks the generator map, filtering and de-duplicating', () => {
    const list = normalizeCommonsList({
      1: commonsFile({ pageid: 1 }),
      2: commonsFile({ pageid: 2 }),
      3: commonsFile({ pageid: 1 }), // duplicate pageid under another key
      4: { pageid: 4, title: 'File:tiny.jpg', imageinfo: [{ mime: 'image/jpeg', width: 100, thumburl: 'u' }] },
    });
    expect(list.map((a) => a.id)).toEqual([1, 2]);
  });

  it('tolerates missing pages', () => {
    expect(normalizeCommonsList(undefined)).toEqual([]);
  });
});

describe('shuffle', () => {
  it('preserves every item without mutating the original', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(out).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a given rng', () => {
    expect(shuffle([1, 2, 3], () => 0.5)).toEqual(shuffle([1, 2, 3], () => 0.5));
  });

  it('handles empty input', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(null)).toEqual([]);
  });
});
