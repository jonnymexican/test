import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildBragText, shareToFacebook, shareToWhatsApp, APP_URL } from './social';

describe('vicinityGo social sharing', () => {
  let openSpy;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('builds a brag line with quest title, XP and city', () => {
    const quest = { title: 'The Slow Wander', xp: 50 };
    expect(buildBragText(quest, 'Capitol Hill')).toBe(
      '🧭 Just completed "The Slow Wander" and earned 50 XP exploring around Capitol Hill on vicinityGo!'
    );
  });

  it('omits the city clause when no city is known', () => {
    expect(buildBragText({ title: 'X', xp: 10 })).toBe(
      '🧭 Just completed "X" and earned 10 XP exploring on vicinityGo!'
    );
  });

  it('opens the Facebook sharer with the encoded brag and app URL', () => {
    shareToFacebook('hello brag', 'https://example.com/');
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.mock.calls[0][0];
    expect(url).toContain('https://www.facebook.com/sharer/sharer.php?u=');
    expect(url).toContain(encodeURIComponent('https://example.com/'));
    expect(url).toContain(encodeURIComponent('hello brag'));
  });

  it('opens WhatsApp with text plus app URL', () => {
    shareToWhatsApp('come play');
    const url = openSpy.mock.calls[0][0];
    expect(url).toContain('https://wa.me/?text=');
    expect(url).toContain(encodeURIComponent(`come play ${APP_URL}`));
  });
});
