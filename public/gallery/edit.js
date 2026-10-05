/**
 * The Gallery — caption & show-rename editor.
 *
 * A small modal for fixing captions and show names straight from the gallery
 * page. Edits go through the bureau-vault worker's /art proxy (which holds
 * the GitHub token) and persist exactly where the page reads them back:
 * captions on the asset's GitHub label, show names on the release name.
 *
 * The key is the same fleet admin key the uploader stores, so a device that
 * has uploaded before can edit with zero setup: tap a work → ✏️ → text → Save.
 * index.html owns the markup; this module only wires it up via `ids`.
 */

const CAPTION_MAX = 120; // mirrors the worker's guard

export function createEditor({ vault, storageKey, ids }) {
  const $ = (id) => document.getElementById(id);
  let isOpen = false;
  let target = null; // { kind, assetId/releaseId, text } — text is the last saved value
  let onDone = null; // resolves the caller's promise

  function getKey() {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch (e) {
      return '';
    }
  }

  function storeKey(k) {
    try {
      localStorage.setItem(storageKey, k);
    } catch (e) {
      /* private mode — the key just won't be remembered */
    }
  }

  function note(msg, cls) {
    $(ids.note).textContent = msg || '';
    $(ids.note).className = 'note' + (cls ? ' ' + cls : '');
  }

  function openDialog(kind, prefill, heading, done) {
    target = kind === 'caption' ? { kind, assetId: done.assetId } : { kind, releaseId: done.releaseId };
    onDone = done.resolve;
    isOpen = true;
    $(ids.heading).textContent = heading;
    $(ids.input).value = prefill;
    $(ids.inputLabel).textContent = kind === 'caption' ? 'Caption' : 'Show name';
    $(ids.save).textContent = kind === 'caption' ? 'Save caption' : 'Save name';
    $(ids.keybox).hidden = !!getKey();
    $(ids.keynote).textContent = '';
    note('');
    $(ids.dialog).hidden = false;
    $(ids.save).disabled = false;
    $(ids.cancel).disabled = false;
    $(ids.input).focus();
  }

  /** Resolve as { saved, text } so callers can confirm what actually landed. */
  function close(result) {
    if (!isOpen) return;
    isOpen = false;
    $(ids.dialog).hidden = true;
    const saved = result === 'saved';
    const text = saved && target ? target.text : '';
    const resolve = onDone;
    onDone = null;
    target = null;
    if (resolve) resolve({ saved: saved, text: text });
  }

  function busy(b) {
    $(ids.save).disabled = b;
    $(ids.cancel).disabled = b;
  }

  async function ensureKey() {
    var k = getKey();
    if (k) return k;
    k = $(ids.key).value.trim();
    if (!k) {
      $(ids.keynote).className = 'note err';
      $(ids.keynote).textContent = 'Paste the fleet admin key first.';
      return null;
    }
    $(ids.keynote).className = 'note';
    $(ids.keynote).textContent = 'Checking the key…';
    var res = await fetch(vault + '/art/ping', { method: 'POST', headers: { 'x-admin-key': k } });
    if (!res.ok) {
      $(ids.keynote).className = 'note err';
      $(ids.keynote).textContent = res.status === 403 ? 'wrong admin key' : 'vault said ' + res.status;
      return null;
    }
    storeKey(k);
    $(ids.keybox).hidden = true;
    return k;
  }

  async function apply() {
    if (!isOpen) return;
    var text = $(ids.input).value.trim();
    if (!text) {
      note(target.kind === 'caption' ? 'The caption can’t be empty.' : 'The name can’t be empty.', 'err');
      return;
    }
    if (text.length > CAPTION_MAX) {
      note('Keep it under ' + CAPTION_MAX + ' characters.', 'err');
      return;
    }
    var key;
    try {
      key = await ensureKey();
    } catch (e) {
      $(ids.keynote).className = 'note err';
      $(ids.keynote).textContent = 'Could not reach the vault (' + e.message + ').';
      return;
    }
    if (!key) return;
    busy(true);
    note('Saving…');
    target.text = text;
    var url =
      target.kind === 'caption'
        ? vault + '/art/asset/' + target.assetId + '/caption'
        : vault + '/art/release/' + target.releaseId + '/name';
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'x-admin-key': key, 'content-type': 'application/json' },
        body: JSON.stringify(target.kind === 'caption' ? { label: text } : { name: text }),
      });
      if (res.ok) {
        close('saved');
        return;
      }
      if (res.status === 403) {
        $(ids.keybox).hidden = false; // stored key went stale — ask again
        $(ids.keynote).className = 'note err';
        $(ids.keynote).textContent = 'That key was rejected — paste the fleet admin key.';
        note('');
      } else {
        var j = null;
        try {
          j = await res.json();
        } catch (e) {}
        note(j && j.detail ? 'GitHub said: ' + j.detail : 'Vault said ' + res.status + '.', 'err');
      }
    } catch (e) {
      note('Could not reach the vault (' + e.message + ').', 'err');
    }
    busy(false);
  }

  $(ids.save).addEventListener('click', apply);
  $(ids.cancel).addEventListener('click', function () {
    close('cancelled');
  });
  $(ids.dialog).addEventListener('click', function (e) {
    if (e.target === $(ids.dialog)) close('cancelled');
  });
  $(ids.input).addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (isOpen && e.key === 'Escape') close('cancelled');
  });

  return {
    isOpen: function () {
      return isOpen;
    },
    /** Edit one artwork's caption. Returns 'saved' | 'cancelled'. */
    editCaption: function (assetId, caption) {
      return new Promise(function (resolve) {
        openDialog('caption', caption, 'Edit caption', { assetId: assetId, resolve: resolve });
      });
    },
    /** Rename a show. Returns 'saved' | 'cancelled'. */
    renameShow: function (releaseId, title) {
      return new Promise(function (resolve) {
        openDialog('title', title, 'Rename show', { releaseId: releaseId, resolve: resolve });
      });
    },
  };
}
