import { describe, expect, it } from 'vitest';
import { firstVisitSources, PUBLIC_SOURCES, mergeCatalogSources } from './source-catalog';

describe('source picker catalog', () => {
  const empty = { customAPIs: [], envSources: [], subscriptions: [] };
  it('provides three starter sources to a fresh installation', () => {
    expect(firstVisitSources(false, empty)).toHaveLength(3);
  });
  it('preserves saved empty selections and existing administrator or user settings', () => {
    expect(firstVisitSources(true, empty)).toEqual([]);
    const source = { key: 's', name: '自建', url: 'https://example.com/api' };
    expect(firstVisitSources(false, { ...empty, customAPIs: [source] })).toEqual([]);
    expect(firstVisitSources(false, { ...empty, envSources: [source] })).toEqual([]);
    expect(firstVisitSources(false, { ...empty, subscriptions: ['https://example.com/list'] })).toEqual([]);
  });
  it('bundles public endpoints without credentials or duplicate addresses', () => {
    expect(PUBLIC_SOURCES.length).toBeGreaterThan(3);
    expect(new Set(PUBLIC_SOURCES.map(s => s.url)).size).toBe(PUBLIC_SOURCES.length);
    for (const source of PUBLIC_SOURCES) {
      const url = new URL(source.url);
      expect(url.protocol).toMatch(/^https?:$/);
      expect(url.username + url.password).toBe('');
      expect([...url.searchParams.keys()].some(k => /token|password|secret|key/i.test(k))).toBe(false);
    }
  });
  it('preserves saved keys and settings when remote lists repeat an endpoint', () => {
    const saved = { key: 'custom_8', name: '我的名称', url: 'https://a.example/api', detail: 'https://a.example' };
    const result = mergeCatalogSources([saved], [
      { name: '远程名称', url: 'https://a.example/api/' },
      { name: '新源', url: 'https://b.example/api' },
      { name: '重复的新源', url: 'https://b.example/api/' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(saved);
    expect(result[1].key).toBeUndefined();
  });
  it('keeps manually added sources when a refreshed catalog is empty', () => {
    const saved = { key: 'custom_1', name: '自建源', url: 'https://a.example/api' };
    expect(mergeCatalogSources([saved], [])).toEqual([saved]);
  });
});
