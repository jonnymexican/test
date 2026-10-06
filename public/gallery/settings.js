/**
 * The Gallery — the show settings surface.
 *
 * One dialog per show that used to live in three places: renaming the show
 * and fixing captions (edit.js), the fleet admin key that unlocks both the
 * uploader and the vault proxy, and the "hang more photos" link. Everything
 * here targets the same bureau-vault /art routes the lightbox editor uses,
 * so a device with the key stored edits with zero setup.
 *
 * index.html owns the markup; this module wires it up via `ids`, exactly
 * like edit.js. `slugifyTag`, `uploadHref` and `changedCaptions` are pure
 * and tested in src/settings.test.js.
 */

const CAPTION_MAX = 120; // mirrors the worker's guard

/** "Studio 2026" → "studio-2026" — same rules the uploader applies. */
export function slugifyTag(raw) {
  return (
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mixed-bag'
  );
}

/** The uploader, prefilled with this show's collection tag. */
export function uploadHref(tag) {
  return './upload.html?tag=' + encodeURIComponent(slugifyTag(tag));
}

/**
 * Which captions actually changed?
 * `images` — [{ asset, caption }] (current server text)
 * `values` — [string] in the same order (what the inputs hold now)
 * Returns [{ id, label }] for the trimmed, non-empty, different ones, so a
 * save round-trip only PATCHes what the user touched. Over-long or empty
 * edits are dropped here rather than sent.
 */
export function changedCaptions(images, values) {
  const out = [];
  (images || []).forEach(function (im, i) {
    const raw = values == null ? '' : String(values[i] == null ? '' : values[i]).trim();
    if (!raw || raw.length > CAPTION_MAX) return;
    if (raw === im.caption) return;
    out.push({ id: im.asset.id, label: raw });
  });
  return out;
}

export function createSettings({ vault, storageKey, ids, onSaved }) {
  const $ = (id) => document.getElementById(id);
  let isOpen = false;
  let show = null; // { id, title, tag, images }
  let rows = []; // [{ im, input }]
  let onDone = null;

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

  function keyNote(msg, cls) {
    $(ids.keynote).textContent = msg || '';
    $(ids.keynote).className = 'note' + (cls ? ' ' + cls : '');
  }

  /** Stored key or the one being pasted, validated against /art/ping. */
  async function ensureKey() {
    let k = getKey();
    if (k) return k;
    k = ($(ids.key).value || '').trim();
    if (!k) {
      keyNote('Paste the fleet admin key first.', 'err');
      return null;
    }
    keyNote('Checking the key…');
    let res;
    try {
      res = await fetch(vault + '/art/ping', { method: 'POST', headers: { 'x-admin-key': k } });
    } catch (e) {
      keyNote('Could not reach the vault (' + e.message + ').', 'err');
      return null;
    }
    if (!res.ok) {
      keyNote(res.status === 403 ? 'Wrong admin key.' : 'Vault said ' + res.status + '.', 'err');
      return null;
    }
    storeKey(k);
    $(ids.key).value = '';
    syncKeyUi();
    return k;
  }

  function syncKeyUi() {
    const stored = !!getKey();
    $(ids.keystatus).textContent = stored
      ? '✅ This device holds the fleet admin key.'
      : '🔒 No key stored on this device yet.';
    $(ids.forget).hidden = !stored;
  }

  function busy(b) {
    $(ids.save).disabled = b;
    $(ids.close).disabled = b;
  }

  async function post(url, body, key) {
    return fetch(url, {
      method: 'POST',
      headers: { 'x-admin-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** One artwork's caption row: thumbnail + input. */
  function makeRow(im) {
    const row = document.createElement('div');
    row.className = 'cap-row';
    const img = document.createElement('img');
    img.src = im.src;
    img.alt = '';
    img.loading = 'lazy';
    const input = document.createElement('input');
    input.value = im.caption;
    input.maxLength = CAPTION_MAX;
    input.setAttribute('aria-label', 'Caption for ' + im.caption);
    row.appendChild(img);
    row.appendChild(input);
    rows.push({ im: im, input: input });
    return row;
  }

  function renderCaptions() {
    const box = $(ids.caps);
    box.textContent = '';
    rows = [];
    (show.images || []).forEach(function (im) {
      box.appendChild(makeRow(im));
    });
    $(ids.capshint).textContent =
      (show.images || []).length + ' work' + ((show.images || []).length === 1 ? '' : 's');
  }

  async function apply() {
    if (!isOpen || !show) return;
    const name = $(ids.name).value.trim();
    if (!name) {
      note('The show name can’t be empty.', 'err');
      return;
    }
    if (name.length > CAPTION_MAX) {
      note('Keep it under ' + CAPTION_MAX + ' characters.', 'err');
      return;
    }
    const touched = changedCaptions(
      rows.map((r) => r.im),
      rows.map((r) => r.input.value)
    );
    const tooLong = rows.some((r) => {
      const v = r.input.value.trim();
      return v.length > CAPTION_MAX;
    });
    if (tooLong) {
      note('Keep captions under ' + CAPTION_MAX + ' characters.', 'err');
      return;
    }
    let key;
    try {
      key = await ensureKey();
    } catch (e) {
      keyNote('Could not reach the vault (' + e.message + ').', 'err');
      return;
    }
    if (!key) return;
    busy(true);
    note('Saving…');
    const saved = {};
    try {
      if (name !== show.title) {
        const res = await post(vault + '/art/release/' + show.id + '/name', { name: name }, key);
        if (res.status === 403) {
          keyNote('That key was rejected — paste the fleet admin key.', 'err');
          $(ids.keybox).hidden = false;
          note('');
          busy(false);
          return;
        }
        if (!res.ok) throw new Error('rename: vault said ' + res.status);
        saved.name = name;
        show.title = name;
      }
      let caps = 0;
      for (const change of touched) {
        const res = await post(
          vault + '/art/asset/' + change.id + '/caption',
          { label: change.label },
          key
        );
        if (res.status === 403) {
          keyNote('That key was rejected — paste the fleet admin key.', 'err');
          $(ids.keybox).hidden = false;
          note('');
          busy(false);
          return;
        }
        if (!res.ok) throw new Error('caption: vault said ' + res.status);
        const row = rows.find((r) => r.im.asset.id === change.id);
        if (row) row.im.caption = change.label;
        caps++;
      }
      if (caps) saved.captions = caps;
      if (ids.upload) $(ids.upload).href = uploadHref(show.tag || show.title);
      const bits = [];
      if (saved.name) bits.push('show renamed');
      if (caps) bits.push(caps + ' caption' + (caps === 1 ? '' : 's') + ' updated');
      note(bits.length ? '✔ Saved — ' + bits.join(', ') + '.' : '✔ Nothing to save.', 'ok');
      if (onSaved) onSaved(saved);
    } catch (e) {
      note('Something went wrong (' + e.message + ').', 'err');
    }
    busy(false);
  }

  function open(showData) {
    show = showData;
    isOpen = true;
    $(ids.heading).textContent = '⚙ ' + (show.title || 'Show settings');
    $(ids.name).value = show.title || '';
    renderCaptions();
    $(ids.keybox).hidden = !!getKey();
    keyNote('');
    $(ids.key).value = '';
    if (ids.upload) $(ids.upload).href = uploadHref(show.tag || show.title);
    syncKeyUi();
    note('');
    $(ids.dialog).hidden = false;
    busy(false);
    $(ids.name).focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    show = null;
    rows = [];
    $(ids.dialog).hidden = true;
    if (onDone) {
      const d = onDone;
      onDone = null;
      d();
    }
  }

  $(ids.save).addEventListener('click', apply);
  $(ids.close).addEventListener('click', close);
  if (ids.connect) {
    $(ids.connect).addEventListener('click', async function () {
      let k = null;
      try {
        k = await ensureKey();
      } catch (e) {
        keyNote('Could not reach the vault (' + e.message + ').', 'err');
        return;
      }
      if (k) keyNote('✔ Key works — this device is connected.', 'ok');
    });
  }
  $(ids.dialog).addEventListener('click', function (e) {
    if (e.target === $(ids.dialog)) close();
  });
  $(ids.name).addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  });
  $(ids.forget).addEventListener('click', function () {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
    syncKeyUi();
    $(ids.keybox).hidden = false;
    keyNote('Key forgotten — paste it again to edit.', 'err');
  });
  document.addEventListener('keydown', function (e) {
    if (isOpen && e.key === 'Escape') close();
  });

  return {
    isOpen: function () {
      return isOpen;
    },
    open: open,
    close: close,
    /** Resolves when the dialog closes (callers awaiting a change). */
    openAndWait: function (showData) {
      return new Promise(function (resolve) {
        onDone = resolve;
        open(showData);
      });
    },
  };
}
