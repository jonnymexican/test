import * as React from 'react';
import { downloadBackup, parseBackup, applyBackup } from './backup';

const STATUS_DURATION = 4000;

export default function BackupRestore() {
  const [status, setStatus] = React.useState(null); // { tone: 'ok' | 'error', text }
  const inputRef = React.useRef(null);
  const timerRef = React.useRef(null);

  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  const flash = (tone, text) => {
    setStatus({ tone, text });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(null), STATUS_DURATION);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const applied = applyBackup(parseBackup(await file.text()));
      flash('ok', `Restored ${applied} section${applied === 1 ? '' : 's'} — reloading…`);
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      flash(
        'error',
        err?.message === 'Not a Get Inspired backup file'
          ? 'That file is not a Get Inspired backup.'
          : 'Import failed — could not read that file.'
      );
    }
  };

  return (
    <div className="backup-restore">
      <button type="button" className="backup-button" onClick={downloadBackup}>
        Export backup
      </button>
      <button type="button" className="backup-button" onClick={() => inputRef.current?.click()}>
        Import backup
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleImport}
      />
      {status && (
        <p
          className={`backup-status ${status.tone === 'error' ? 'backup-status-error' : ''}`}
          role="status"
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
