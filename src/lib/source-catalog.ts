import type { SourceConfig } from './types';

export const SOURCE_CATALOGS = [
  { name: 'Yifan 社区列表', url: 'https://gist.githubusercontent.com/yifanwang-yet/dbb7af044d90b5f51c1f32d0e0a200f6/raw/libretv-sources.json' },
  { name: 'Foxmurphy 社区列表', url: 'https://raw.githubusercontent.com/foxmurphy/libretv-subscribe/main/libretv_sources.json' },
];

export type CatalogSource = Omit<SourceConfig, 'key'>;

export function sourceIdentity(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Prefer the user's saved configuration, and collapse duplicate endpoints across lists. */
export function mergeCatalogSources(saved: SourceConfig[], remote: CatalogSource[]): (CatalogSource & { key?: string })[] {
  const entries = new Map<string, CatalogSource & { key?: string }>();
  for (const source of [...saved, ...remote]) {
    const id = sourceIdentity(source.url);
    if (!entries.has(id)) entries.set(id, source);
  }
  return [...entries.values()];
}
