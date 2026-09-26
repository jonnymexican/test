// Backup/restore for vicinityGo progress. All apps on this GitHub Pages
// origin share one localStorage bucket, so a "clear site data" anywhere
// wipes everything — this JSON backup is the safety net.

const STORAGE_KEY = 'vicinitygo:progress';

export function exportBackup() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return {
      app: 'vicinitygo',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: raw == null ? null : JSON.parse(raw),
    };
  } catch {
    // Corrupt entry — back up as empty rather than fail.
    return { app: 'vicinitygo', version: 1, exportedAt: new Date().toISOString(), data: null };
  }
}

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vicinitygo-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    throw new Error('Not a vicinityGo backup file');
  }
  if (!parsed || parsed.app !== 'vicinitygo') {
    throw new Error('Not a vicinityGo backup file');
  }
  return parsed;
}

/** Restores the progress blob; returns true when something was written. */
export function applyBackup(backup) {
  const data = backup?.data;
  if (!data || typeof data !== 'object') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // Storage unavailable — nothing we can do.
    return false;
  }
}
