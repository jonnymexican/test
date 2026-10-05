import { describe, it, expect } from 'vitest';
import { joinCodeFromLocation, inviteLink, DEFAULT_VAULT_URL, CODE_RE } from '../public/mc/vault.js';

describe('joinCodeFromLocation', () => {
  it('reads the code from a ?join= query', () => {
    expect(joinCodeFromLocation('?join=mexican-bureau', '')).toBe('mexican-bureau');
  });

  it('reads the code from a #join= hash', () => {
    expect(joinCodeFromLocation('', '#join=sam-and-emily')).toBe('sam-and-emily');
  });

  it('prefers nothing when both are absent', () => {
    expect(joinCodeFromLocation('', '')).toBe('');
    expect(joinCodeFromLocation('?other=1', '#nope')).toBe('');
  });

  it('rejects malformed codes (too short, bad characters)', () => {
    expect(joinCodeFromLocation('?join=ab', '')).toBe('');
    expect(joinCodeFromLocation('?join=drop;table', '')).toBe('');
    expect(joinCodeFromLocation('?join=<script>', '')).toBe('');
  });
});

describe('inviteLink', () => {
  it('builds a shareable link with the code in the query', () => {
    expect(inviteLink('https://jonnymexican.github.io', 'jon-and-crew')).toBe(
      'https://jonnymexican.github.io/test/mc/?join=jon-and-crew'
    );
  });

  it('tolerates a trailing slash and encodes the code', () => {
    expect(inviteLink('https://jonnymexican.github.io/', 'a-b_c')).toBe(
      'https://jonnymexican.github.io/test/mc/?join=a-b_c'
    );
  });
});

describe('CODE_RE', () => {
  it('matches what the worker accepts', () => {
    expect(CODE_RE.test('mexican-bureau')).toBe(true);
    expect(CODE_RE.test('ab')).toBe(false);
    expect(CODE_RE.test('has space')).toBe(false);
  });
});

describe('DEFAULT_VAULT_URL', () => {
  it('points at the fleet vault over https', () => {
    expect(DEFAULT_VAULT_URL).toMatch(/^https:\/\/bureau-vault/);
  });
});
