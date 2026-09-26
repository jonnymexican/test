import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exportBackup, parseBackup, applyBackup, downloadBackup } from './backup';

describe('get-inspired backup', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('get-inspired:favorites', JSON.stringify(['Stay hungry.']));
    window.localStorage.setItem('get-inspired:theme', 'light');
  });

  it('exports all app data sections with an app marker', () => {
    const backup = exportBackup();
    expect(backup.app).toBe('get-inspired');
    expect(backup.version).toBe(1);
    expect(typeof backup.exportedAt).toBe('string');
    expect(backup.data['get-inspired:favorites']).toEqual(['Stay hungry.']);
    expect(backup.data['get-inspired:theme']).toBe('light');
    expect(backup.data['get-inspired:custom-quotes']).toBeNull(); // unset on this device
  });

  it('backs up corrupt entries as null instead of throwing', () => {
    window.localStorage.setItem('get-inspired:custom-quotes', '{not json');
    const backup = exportBackup();
    expect(backup.data['get-inspired:custom-quotes']).toBeNull();
  });

  it('rejects foreign or malformed files', () => {
    expect(() => parseBackup('not json at all')).toThrow('Not a Get Inspired backup file');
    expect(() => parseBackup('{"app":"vicinitygo","data":{}}')).toThrow(
      'Not a Get Inspired backup file'
    );
    expect(() => parseBackup('{"app":"get-inspired"}')).toThrow('Not a Get Inspired backup file');
  });

  it('applies a valid backup and reports sections restored', () => {
    const backup = JSON.stringify(exportBackup());
    window.localStorage.clear();
    const applied = applyBackup(parseBackup(backup));
    expect(applied).toBe(2); // favorites + theme were non-null
    expect(JSON.parse(window.localStorage.getItem('get-inspired:favorites'))).toEqual([
      'Stay hungry.',
    ]);
    expect(window.localStorage.getItem('get-inspired:theme')).toBe('light');
  });

  it('skips sections missing from the backup', () => {
    const data = parseBackup('{"app":"get-inspired","data":{"get-inspired:theme":"dark"}}');
    const applied = applyBackup(data);
    expect(applied).toBe(1);
    expect(window.localStorage.getItem('get-inspired:theme')).toBe('dark');
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
