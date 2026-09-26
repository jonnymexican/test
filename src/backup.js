// Backup/restore for all Get Inspired data. Every app on this GitHub Pages
// origin shares one localStorage bucket, so a "clear site data" anywhere
// wipes everything — these JSON backups are the safety net.
//
// Codec note: favorites and custom quotes are stored as JSON arrays; the
// theme is a bare string (see useTheme.js). Each key carries its codec so
// a backup round-trip writes back exactly what the app expects.

const KEYS = [
  { key: 'get-inspired:favorites', json: true },
  { key: 'get-inspired:custom-quotes', json: true },
  { key: 'get-inspired:theme', json: false },
];

export function exportBackup() {
  const data = {};
  for (const { key, json } of KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) {
        data[key] = null;
      } else {
        data[key] = json ? JSON.parse(raw) : raw;
      }
    } catch {
      data[key] = null; // corrupt entry — back up as empty rather than fail
    }
  }
  return {
    app: 'get-inspired',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `get-inspired-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a Get Inspired backup file');
  }
  if (
    !parsed ||
    parsed.app !== 'get-inspired' ||
    typeof parsed.data !== 'object' ||
    parsed.data === null
  ) {
    throw new Error('Not a Get Inspired backup file');
  }
  return parsed.data;
}

/** Restores the sections present in the backup; returns how many were written. */
export function applyBackup(data) {
  let applied = 0;
  for (const { key, json } of KEYS) {
    if (key in data && data[key] != null) {
      try {
        window.localStorage.setItem(key, json ? JSON.stringify(data[key]) : data[key]);
        applied += 1;
      } catch {
        // Storage unavailable (private mode, quota) — skip this section.
      }
    }
  }
  return applied;
}
