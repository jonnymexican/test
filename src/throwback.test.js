import { describe, it, expect } from 'vitest';
import {
  extractDate,
  isAudioName,
  pickThrowback,
  prettyName,
  formatDate,
  yearsAgoText,
} from '../public/djmixes/throwback.js';

function rel(name, files) {
  return {
    name,
    assets: files.map((f) => ({ name: f, size: 123, browser_download_url: 'https://x/' + f })),
  };
}

const NOW = new Date('2026-10-03T12:00:00Z'); // Oct 3

describe('isAudioName', () => {
  it('accepts known audio extensions', () => {
    expect(isAudioName('mix.mp3')).toBe(true);
    expect(isAudioName('set.WAV')).toBe(true);
    expect(isAudioName('live.aiff')).toBe(true);
  });

  it('rejects covers and other files', () => {
    expect(isAudioName('cover.jpg')).toBe(false);
    expect(isAudioName('notes.txt')).toBe(false);
  });
});

describe('extractDate', () => {
  it('reads compact YYYYMMDD', () => {
    expect(extractDate('JonathanVoigt-BasementMIX01-20080501.wav')).toBe(Date.UTC(2008, 4, 1));
  });

  it('reads month-day-year', () => {
    expect(extractDate('Jonathan.Voigt.-.Basement.Mix.-.02.-.08-09-2008.mp3')).toBe(Date.UTC(2008, 7, 9));
  });

  it('reads year-month-day', () => {
    expect(extractDate('house_set-2024-3-5.mp3')).toBe(Date.UTC(2024, 2, 5));
  });

  it('rejects undated names', () => {
    expect(extractDate('Jonathan.Voigt.-.Basement.Mix.-.02.mp3')).toBeNull();
    expect(extractDate('mix01.wav')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(extractDate('set-20261340.mp3')).toBeNull();
    expect(extractDate('set-2008-2-30.mp3')).toBeNull();
  });
});

describe('prettyName', () => {
  it('cleans the dotted GitHub filename', () => {
    expect(prettyName('Jonathan.Voigt.-.Basement.Mix.-.02.-.08-09-2008.mp3')).toBe(
      'Jonathan Voigt — Basement Mix — 02 — 08-09-2008'
    );
  });

  it('splits camelCase and keeps compact dates', () => {
    expect(prettyName('JonathanVoigt-BasementMIX01-20080501.wav')).toBe(
      'Jonathan Voigt Basement MIX01 20080501'
    );
  });

  it('keeps dashed dates intact', () => {
    expect(prettyName('set-2024-3-5.mp3')).toBe('set 2024-3-5');
  });
});

describe('pickThrowback', () => {
  it('picks a mix dated exactly today in some year', () => {
    const rs = [rel('r1', ['mix-2008-05-01.mp3']), rel('r2', ['mix-2015-10-03.mp3'])];
    const pick = pickThrowback(rs, NOW);
    expect(pick.asset.name).toBe('mix-2015-10-03.mp3');
    expect(pick.isExactDate).toBe(true);
    expect(pick.distance).toBe(0);
  });

  it('prefers the exact date over a nearer-year near miss', () => {
    const rs = [rel('r', ['mix-2008-10-03.mp3', 'mix-2026-10-02.mp3'])];
    const pick = pickThrowback(rs, NOW);
    expect(pick.asset.name).toBe('mix-2008-10-03.mp3');
  });

  it('falls back to the closest day of any year, wrapping past New Year', () => {
    const rs = [rel('r', ['mix-2008-05-01.mp3', 'set-2005-12-31.wav'])];
    const pick = pickThrowback(rs, new Date('2026-01-01T00:00:00Z'));
    expect(pick.asset.name).toBe('set-2005-12-31.wav');
    expect(pick.distance).toBe(1);
  });

  it('prefers the newest mix when several match today', () => {
    const rs = [rel('r', ['old-2010-10-03.mp3', 'new-2019-10-03.mp3'])];
    expect(pickThrowback(rs, NOW).asset.name).toBe('new-2019-10-03.mp3');
  });

  it('returns null when nothing has a date', () => {
    expect(pickThrowback([rel('r', ['jam.mp3', 'cover.jpg'])], NOW)).toBeNull();
    expect(pickThrowback([], NOW)).toBeNull();
    expect(pickThrowback(null, NOW)).toBeNull();
  });

  it('ignores non-audio assets even when dated', () => {
    expect(pickThrowback([rel('r', ['2024-10-03.txt'])], NOW)).toBeNull();
  });

  it('finds a pick for every day of the year', () => {
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const files = [];
    days.forEach((n, i) => {
      for (let d = 1; d <= n; d++) {
        files.push('mix-2008-' + String(i + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0') + '.mp3');
      }
    });
    const rs = [rel('all', files)];
    const jan1 = Date.UTC(2026, 0, 1);
    for (let doy = 0; doy < 366; doy++) {
      const now = new Date(jan1 + doy * 86400000);
      const pick = pickThrowback(rs, now);
      expect(pick, 'day ' + doy).not.toBeNull();
      expect(pick.distance, 'day ' + doy).toBe(0);
    }
  });
});

describe('display helpers', () => {
  it('formats the date with the year', () => {
    expect(formatDate(Date.UTC(2008, 7, 9))).toContain('2008');
  });

  it('pluralizes years ago', () => {
    expect(yearsAgoText(Date.UTC(2008, 7, 9), NOW)).toBe('18 years ago today');
    expect(yearsAgoText(Date.UTC(2025, 9, 3), NOW)).toBe('a year ago today');
    expect(yearsAgoText(Date.UTC(2026, 0, 5), NOW)).toBe('earlier this year');
  });
});
