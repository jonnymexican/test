import { describe, it, expect } from 'vitest';
import {
  coverRect,
  gridLayout,
  mosaicLayout,
  warholTiles,
  PALETTES,
  shuffled,
} from '../public/popartz/popartz.js';

describe('coverRect', () => {
  it('a wide image in a square cell overflows left/right only', () => {
    const r = coverRect({ x: 0, y: 0, w: 100, h: 100 }, 2);
    expect(r.w).toBe(200);
    expect(r.h).toBe(100);
    expect(r.x).toBe(-50); // centered
    expect(r.y).toBe(0);
  });
  it('a tall image in a wide cell overflows top/bottom only', () => {
    const r = coverRect({ x: 10, y: 10, w: 200, h: 100 }, 0.5);
    expect(r.w).toBe(200);
    expect(r.h).toBe(400);
    expect(r.y).toBe(10 - 150);
  });
  it('a matching aspect fits exactly', () => {
    const r = coverRect({ x: 0, y: 0, w: 100, h: 50 }, 2);
    expect(r).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
});

describe('gridLayout', () => {
  it('tiles count/cols with gaps', () => {
    const rects = gridLayout(4, 2, 210, 210, 10);
    expect(rects).toHaveLength(4);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(rects[1]).toEqual({ x: 110, y: 0, w: 100, h: 100 });
    expect(rects[2]).toEqual({ x: 0, y: 110, w: 100, h: 100 });
  });
  it('left-aligns a short last row', () => {
    const rects = gridLayout(5, 2, 210, 210, 10);
    expect(rects[4].x).toBe(0); // 5th image sits alone, left
  });
});

describe('mosaicLayout', () => {
  it('packs greedy rows that exactly fill the target width', () => {
    const aspects = [1, 1, 1, 1, 1, 1]; // six squares
    const { rects, height } = mosaicLayout(aspects, 630, 200, 10);
    expect(rects).toHaveLength(6);
    // Row 1 bakes four 150px squares (630 = 4*150 + 3*10 gaps)…
    for (let i = 0; i < 4; i++) {
      expect(rects[i].w).toBeCloseTo(150, 5);
      expect(rects[i].h).toBeCloseTo(150, 5);
    }
    // …row 2 is the last row: two squares at the 200px target height.
    expect(rects[4].w).toBeCloseTo(200, 5);
    expect(rects[4].y).toBeCloseTo(160, 5);
    expect(height).toBeCloseTo(360, 5);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(630.0001);
    }
  });
  it('wide images share a row; everything stays inside [0, W]', () => {
    const aspects = [2, 2, 1];
    const { rects, height } = mosaicLayout(aspects, 1000, 300, 0);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1000.0001);
    }
    expect(rects[0].w).toBe(500); // the two 2:1 images split the first row
    expect(rects[1].w).toBe(500);
    expect(rects[2].w).toBe(300); // the square takes the last row at target height
    expect(height).toBe(250 + 300);
  });
  it('handles an empty wall', () => {
    expect(mosaicLayout([], 100, 50, 5)).toEqual({ rects: [], height: 0 });
  });
});

describe('warholTiles', () => {
  it('makes an n×n wall with rotating hues', () => {
    const tiles = warholTiles(2, 210, 210, 10);
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toEqual({ x: 0, y: 0, w: 100, h: 100, filter: 'hue-rotate(0deg) saturate(1.4)' });
    expect(tiles[3].filter).toContain('hue-rotate(270deg)');
    const distinct = new Set(tiles.map((t) => t.filter));
    expect(distinct.size).toBe(4);
  });
});

describe('extras', () => {
  it('palettes are named', () => {
    expect(PALETTES.every((p) => p.name && p.bg && p.ink)).toBe(true);
  });
  it('shuffled keeps every element', () => {
    const out = shuffled([1, 2, 3, 4, 5]);
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
