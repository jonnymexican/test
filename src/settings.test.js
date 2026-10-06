import { describe, it, expect } from 'vitest';
import { slugifyTag, uploadHref, changedCaptions } from '../public/gallery/settings.js';

describe('slugifyTag', () => {
  it('lowercases and dashes words', () => {
    expect(slugifyTag('Studio 2026')).toBe('studio-2026');
    expect(slugifyTag('Blue Dusk — oil')).toBe('blue-dusk-oil');
  });

  it('keeps dots, underscores and dashes the API already accepts', () => {
    expect(slugifyTag('spring.sketches_2')).toBe('spring.sketches_2');
    expect(slugifyTag('--already-slug--')).toBe('already-slug');
  });

  it('falls back to mixed-bag when nothing usable remains', () => {
    expect(slugifyTag('')).toBe('mixed-bag');
    expect(slugifyTag('   ')).toBe('mixed-bag');
    expect(slugifyTag('!!!')).toBe('mixed-bag');
    expect(slugifyTag(null)).toBe('mixed-bag');
  });

  it('matches the sanitizing the uploader itself applies', () => {
    const uploader = (s) =>
      (s.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')) ||
      'mixed-bag';
    ['studio 2026', 'Blue Dusk — oil', 'A/B tests', '  spaced  '].forEach((raw) => {
      expect(slugifyTag(raw)).toBe(uploader(raw));
    });
  });
});

describe('uploadHref', () => {
  it('points at the uploader with the tag prefilled', () => {
    expect(uploadHref('studio 2026')).toBe('./upload.html?tag=studio-2026');
  });

  it('encodes whatever survives slugify', () => {
    expect(uploadHref('weird?name')).toBe('./upload.html?tag=weird-name');
    expect(uploadHref('a/b tests')).toBe('./upload.html?tag=a-b-tests');
  });
});

describe('changedCaptions', () => {
  const img = (id, caption) => ({ asset: { id }, caption });

  it('returns only the captions the user actually edited', () => {
    const images = [img(1, 'Sunrise'), img(2, 'Dusk')];
    expect(changedCaptions(images, ['Sunrise', 'Blue dusk'])).toEqual([
      { id: 2, label: 'Blue dusk' },
    ]);
  });

  it('trims before comparing and before sending', () => {
    const images = [img(1, 'Sunrise')];
    expect(changedCaptions(images, ['  Sunrise  '])).toEqual([]);
    expect(changedCaptions(images, ['  Morning light  '])).toEqual([
      { id: 1, label: 'Morning light' },
    ]);
  });

  it('drops empty edits instead of clearing the caption', () => {
    const images = [img(1, 'Sunrise')];
    expect(changedCaptions(images, [''])).toEqual([]);
    expect(changedCaptions(images, ['   '])).toEqual([]);
  });

  it('drops over-long edits rather than sending them', () => {
    const images = [img(1, 'Sunrise')];
    expect(changedCaptions(images, ['x'.repeat(121)])).toEqual([]);
    expect(changedCaptions(images, ['x'.repeat(120)])).toHaveLength(1);
  });

  it('survives missing rows', () => {
    expect(changedCaptions(null, [])).toEqual([]);
    expect(changedCaptions([img(1, 'Sunrise')], [])).toEqual([]);
  });
});
