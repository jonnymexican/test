// Share helpers for bragging about quests. Facebook's sharer and WhatsApp's
// wa.me are open endpoints — no SDK, no accounts, no review process.

export const APP_URL = 'https://jonnymexican.github.io/test/vicinitygo/';

/** The brag line for a finished quest. */
export function buildBragText(quest, city) {
  const place = city ? ` around ${city}` : '';
  return `🧭 Just completed "${quest.title}" and earned ${quest.xp} XP exploring${place} on vicinityGo!`;
}

/** One-shot window open used by every button — exported so tests can stub it. */
export function openSharePopup(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function shareToFacebook(text, url = APP_URL) {
  openSharePopup(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`);
}

export function shareToWhatsApp(text) {
  openSharePopup(`https://wa.me/?text=${encodeURIComponent(`${text} ${APP_URL}`)}`);
}

export async function shareNative({ title, text }) {
  if (typeof navigator.share !== 'function') return false;
  try {
    await navigator.share({ title, text, url: APP_URL });
    return true;
  } catch {
    return false; // user dismissed the sheet
  }
}

export function hasNativeShare() {
  return typeof navigator.share === 'function';
}
