import { describe, it, expect } from 'vitest';
import { parseShareTarget } from './shareIntake';

describe('vicinityGo share target intake', () => {
  it('extracts coordinates from a Google Maps @lat,lng URL', () => {
    const params = new URLSearchParams({
      title: 'Space Needle',
      url: 'https://maps.google.com/@47.6205,-122.3493,17z',
    });
    const out = parseShareTarget(params);
    expect(out.coords).toEqual({ lat: 47.6205, lng: -122.3493 });
    expect(out.label).toBe('Space Needle');
    expect(out.source).toBe('url');
  });

  it('extracts coordinates from an OSM #map= link', () => {
    const out = parseShareTarget(
      new URLSearchParams({ url: 'https://www.openstreetmap.org/#map=17/47.6205/-122.3493' })
    );
    expect(out.coords).toEqual({ lat: 47.6205, lng: -122.3493 });
    expect(out.source).toBe('url');
  });

  it('reads Google Maps ?q=lat,lng style links', () => {
    const out = parseShareTarget(
      new URLSearchParams({ url: 'https://maps.google.com/?q=47.6062,-122.3321' })
    );
    expect(out.coords).toEqual({ lat: 47.6062, lng: -122.3321 });
    expect(out.source).toBe('q');
  });

  it('reads coordinates pasted as plain text', () => {
    const out = parseShareTarget(new URLSearchParams({ text: 'meet at 47.6205, -122.3493' }));
    expect(out.coords).toEqual({ lat: 47.6205, lng: -122.3493 });
    expect(out.source).toBe('text');
  });

  it('keeps the place name from ?q= when a link has no coordinates', () => {
    const out = parseShareTarget(
      new URLSearchParams({ url: 'https://maps.google.com/?q=Pike+Place+Market' })
    );
    expect(out.coords).toBeNull();
    expect(out.label).toBe('Pike Place Market');
    expect(out.source).toBe('q');
  });

  it('reports label-only intake when a place name but no coords were shared', () => {
    const out = parseShareTarget(new URLSearchParams({ text: 'check out this cool bench' }));
    expect(out).toEqual({ coords: null, label: 'check out this cool bench', source: 'text' });
  });

  it('returns null when there is nothing to ingest', () => {
    expect(parseShareTarget(new URLSearchParams())).toBeNull();
  });
});
