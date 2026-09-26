import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exportBackup, parseBackup, applyBackup, downloadBackup } from './backup';

const SAMPLE = {
  origin: { lat: 47.6, lng: -122.33 },
  city: 'Harborline',
  quests: [{ id: 'food-0', done: false }],
  bankedXp: 50,
};

describe('vicinitygo backup', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('vicinitygo:progress', JSON.stringify(SAMPLE));
  });

  it('exports the progress blob with an app marker', () => {
    const backup = exportBackup();
    expect(backup.app).toBe('vicinitygo');
    expect(backup.version).toBe(1);
    expect(typeof backup.exportedAt).toBe('string');
    expect(backup.data).toEqual(SAMPLE);
  });

  it('exports null data when nothing is saved', () => {
    window.localStorage.clear();
    const backup = exportBackup();
    expect(backup.data).toBeNull();
  });

  it('exports null data instead of throwing on corrupt storage', () => {
    window.localStorage.setItem('vicinitygo:progress', '{not json');
    expect(exportBackup().data).toBeNull();
  });

  it('rejects foreign or malformed files', () => {
    expect(() => parseBackup('not json at all')).toThrow('Not a vicinityGo backup file');
    expect(() => parseBackup('{"app":"get-inspired","data":{}}')).toThrow(
      'Not a vicinityGo backup file'
    );
    expect(() => parseBackup('[]')).toThrow('Not a vicinityGo backup file');
  });

  it('restores progress from a valid backup', () => {
    const backup = JSON.stringify(exportBackup());
    window.localStorage.clear();
    expect(applyBackup(parseBackup(backup))).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('vicinitygo:progress'))).toEqual(SAMPLE);
  });

  it('refuses backups with no progress payload', () => {
    expect(applyBackup(parseBackup('{"app":"vicinitygo","data":null}'))).toBe(false);
    expect(applyBackup(parseBackup('{"app":"vicinitygo"}'))).toBe(false);
  });

  it('downloadBackup triggers a JSON file download', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBackup();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
