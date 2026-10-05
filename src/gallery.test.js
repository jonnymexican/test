import { describe, it, expect } from 'vitest';
import {
  isImageName,
  prettyName,
  captionOf,
  fmtSize,
  collectArtwork,
  allImages,
} from '../public/gallery/gallery.js';

function asset(name, extra = {}) {
  return { name, size: 1000, browser_download_url: 'https://x/' + name, ...extra };
}

function rel(name, assets) {
  return { name, tag_name: name.replace(/\s+/g, '-'), assets };
}

describe('isImageName', () => {
  it('accepts browser-safe image formats', () => {
    expect(isImageName('IMG_2041.jpg')).toBe(true);
    expect(isImageName('study.jpeg')).toBe(true);
    expect(isImageName('dusk.PNG')).toBe(true);
    expect(isImageName('mural.webp')).toBe(true);
    expect(isImageName('sketch.gif')).toBe(true);
    expect(isImageName('print.avif')).toBe(true);
  });

  it('rejects non-images', () => {
    expect(isImageName('notes.txt')).toBe(false);
    expect(isImageName('IMG_2041.heic')).toBe(false);
    expect(isImageName('poster.tiff')).toBe(false);
    expect(isImageName('caption.jpg.txt')).toBe(false);
  });
});

describe('prettyName', () => {
  it('clears extension, dots, underscores and dashes', () => {
    expect(prettyName('IMG_2041.jpg')).toBe('IMG 2041');
    expect(prettyName('Sunrise.Oil.Study.2024.png')).toBe('Sunrise Oil Study 2024');
    expect(prettyName('blue-dusk-final.jpg')).toBe('blue dusk final');
  });

  it('splits camelCase', () => {
    expect(prettyName('harborSunsetStudy.jpg')).toBe('harbor Sunset Study');
  });
});

describe('captionOf', () => {
  it('prefers the GitHub label (the caption)', () => {
    expect(captionOf(asset('a.jpg', { label: 'Blue dusk — oil on canvas' }))).toBe('Blue dusk — oil on canvas');
  });

  it('falls back to the tidied filename', () => {
    expect(captionOf(asset('IMG_2041.jpg'))).toBe('IMG 2041');
    expect(captionOf(asset('a.jpg', { label: '   ' }))).toBe('a');
  });
});

describe('fmtSize', () => {
  it('reads human-scaled', () => {
    expect(fmtSize(500)).toBe('1 KB');
    expect(fmtSize(412_000)).toBe('412 KB');
    expect(fmtSize(3_400_000)).toBe('3.4 MB');
  });
});

describe('collectArtwork', () => {
  it('groups images by release and drops non-images', () => {
    const shows = collectArtwork([
      rel('studio 2026', [asset('b.jpg'), asset('a.png'), asset('notes.txt')]),
      rel('empty', [asset('readme.md')]),
    ]);
    expect(shows).toHaveLength(1);
    expect(shows[0].title).toBe('studio 2026');
    expect(shows[0].images.map((i) => i.asset.name)).toEqual(['a.png', 'b.jpg']);
  });

  it('uses the release name as the show title', () => {
    const shows = collectArtwork([rel('sketchbook', [asset('x.jpg')])]);
    expect(shows[0].title).toBe('sketchbook');
  });

  it('keeps the release id so the editor can target renames', () => {
    const shows = collectArtwork([{ id: 42, name: 'studio', tag_name: 'studio', assets: [asset('a.jpg')] }]);
    expect(shows[0].id).toBe(42);
  });
});

describe('allImages', () => {
  it('flattens shows in order for the lightbox walk', () => {
    const shows = collectArtwork([
      rel('one', [asset('a.jpg')]),
      rel('two', [asset('b.jpg'), asset('c.jpg')]),
    ]);
    expect(allImages(shows).map((i) => i.asset.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(allImages([])).toEqual([]);
  });
});
