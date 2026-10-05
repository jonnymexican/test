/**
 * Mission Control — "join a vault" dialog.
 *
 * One bureau code connects every fleet app on this device to the shared
 * vault, with no agent and no code edits. Jon generates an invite link
 * here and sends it; Sam or emily taps it, lands on Mission Control with
 * the code prefilled, taps Join, and every fleet app on their phone
 * starts reading that bureau live. index.html owns the markup; this
 * module wires it up via `ids` and the storage helpers passed in.
 */

import { joinCodeFromLocation, inviteLink, DEFAULT_VAULT_URL, CODE_RE } from './vault.js';

const APPS = [
  { key: 'friendcredit', label: 'FriendCredit™' },
  { key: 'adhdtracker', label: 'adhdTracker' },
];

export function createJoinUi({ readJSON, writeJSON, ids, onJoined, onLeft }) {
  const $ = (id) => document.getElementById(id);
  let invitedBy = ''; // prefill from an invite link, shown while editing

  function readSettings(appKey) {
    var s = readJSON(appKey + ':vault-settings');
    if (!s || !/^https:\/\//.test(s.url || '') || !s.code) return null;
    return s;
  }

  function writeSettings(appKey, code) {
    writeJSON(appKey + ':vault-settings', {
      url: DEFAULT_VAULT_URL,
      code: code,
      joinedAt: new Date().toISOString(),
    });
  }

  function joinedCodes() {
    var codes = new Set();
    APPS.forEach(function (app) {
      var s = readSettings(app.key);
      if (s) codes.add(s.code);
    });
    return codes;
  }

  function note(msg, cls) {
    $(ids.note).textContent = msg || '';
    $(ids.note).className = 'join-note' + (cls ? ' ' + cls : '');
  }

  function syncButtons() {
    var code = $(ids.input).value.trim();
    var ok = CODE_RE.test(code);
    $(ids.join).disabled = !ok;
    $(ids.copy).disabled = !ok;
    var codes = [...joinedCodes()];
    if (codes.length) {
      $(ids.leave).hidden = false;
      $(ids.leave).textContent = 'Leave ' + codes.join(' + ');
      $(ids.status).textContent =
        'This device is in the vault' + (codes.length > 1 ? 's' : '') + ': ' + codes.join(', ') + '.';
    } else {
      $(ids.leave).hidden = true;
      $(ids.status).textContent = invitedBy
        ? 'You were invited to bureau ' + invitedBy + '.'
        : 'Not joined yet — this device reads only its own local data.';
    }
  }

  function open(prefill) {
    invitedBy = prefill || '';
    $(ids.input).value = invitedBy;
    note('');
    syncButtons();
    $(ids.dialog).hidden = false;
    $(ids.input).focus();
  }

  function close() {
    $(ids.dialog).hidden = true;
  }

  async function join() {
    var code = $(ids.input).value.trim();
    if (!CODE_RE.test(code)) {
      note('Codes are 4-40 letters, numbers or dashes.', 'err');
      return;
    }
    $(ids.join).disabled = true;
    $(ids.copy).disabled = true;
    note('Knocking on bureau ' + code + '…');
    try {
      var res = await fetch(DEFAULT_VAULT_URL + '/bureau/' + encodeURIComponent(code), {
        headers: { 'x-vault-code': code },
      });
      if (res.status === 404) {
        note('No bureau answers to "' + code + '" yet — check the spelling, or have Jon create it.', 'err');
        return;
      }
      if (!res.ok) throw new Error('vault said ' + res.status);
      APPS.forEach(function (app) {
        writeSettings(app.key, code);
      });
      note('✔ Joined bureau ' + code + ' — the cards now read it live.', 'ok');
      syncButtons();
      if (onJoined) onJoined();
    } catch (e) {
      note('Could not reach the vault (' + e.message + ').', 'err');
    }
    $(ids.join).disabled = false;
    $(ids.copy).disabled = false;
  }

  async function copyInvite() {
    var code = $(ids.input).value.trim();
    var link = inviteLink(location.origin, code);
    try {
      await navigator.clipboard.writeText(link);
      note('Invite link copied — send it to Sam or emily. It joins their phone to ' + code + '.', 'ok');
    } catch (e) {
      // Clipboard can be blocked (http, permissions) — show it instead.
      note('Copy this invite link: ' + link, 'ok');
    }
  }

  function leave() {
    APPS.forEach(function (app) {
      try {
        localStorage.removeItem(app.key + ':vault-settings');
      } catch (e) {}
    });
    invitedBy = '';
    note("Left the vault. The cards are back to this device's own data.", 'ok');
    syncButtons();
    if (onLeft) onLeft();
  }

  $(ids.join).addEventListener('click', join);
  $(ids.copy).addEventListener('click', copyInvite);
  $(ids.leave).addEventListener('click', leave);
  $(ids.close).addEventListener('click', close);
  $(ids.dialog).addEventListener('click', function (e) {
    if (e.target === $(ids.dialog)) close();
  });
  $(ids.input).addEventListener('input', syncButtons);
  $(ids.input).addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      join();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!$(ids.dialog).hidden && e.key === 'Escape') close();
  });

  return { open: open, close: close, joinedCodes: joinedCodes };
}
