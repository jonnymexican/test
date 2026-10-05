/**
 * Mission Control — vault settings helpers (pure, tested).
 *
 * A "vault" is one bureau code on the fleet's bureau-vault worker. Both
 * fleet apps persist their settings on this shared origin under
 * `<app>:vault-settings` as { url, code, joinedAt }, and mc.js reads the
 * same keys — so joining here lights up the cards for every fleet app on
 * this device, and an invite link does the same on someone else's phone.
 */

export var DEFAULT_VAULT_URL = 'https://bureau-vault.jonnymexican.workers.dev';

/** Same shape the worker enforces for bureau codes. */
export var CODE_RE = /^[A-Za-z0-9-]{4,40}$/;

/**
 * The bureau code from an invite link (?join=CODE or #join=CODE).
 * Returns '' when absent or malformed — never trust the URL blindly.
 * The code must run to the end of the parameter (end, & or #), so
 * "?join=drop;table" yields nothing rather than the partial "drop".
 */
export function joinCodeFromLocation(search, hash) {
  var sources = [String(search || ''), String(hash || '')];
  for (var i = 0; i < sources.length; i++) {
    var m = sources[i].match(/[?&#]join=([A-Za-z0-9-]{4,40})(?:&|#|$)/);
    if (m) return m[1];
  }
  return '';
}

/** The invite link for a code — open it on another phone and MC joins itself. */
export function inviteLink(origin, code) {
  return (
    String(origin || '').replace(/\/+$/, '') +
    '/test/mc/?join=' +
    encodeURIComponent(String(code || ''))
  );
}
