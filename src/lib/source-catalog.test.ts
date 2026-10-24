import { describe, expect, it } from 'vitest';
import { mergeCatalogSources } from './source-catalog';

describe('source picker catalog', () => {
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
