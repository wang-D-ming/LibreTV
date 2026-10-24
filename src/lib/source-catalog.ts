import type { SourceConfig } from './types';
import bundled from '../../public/sources.json';

export const BUNDLED_CATALOG_URL = '/sources.json';
export const PUBLIC_SOURCES = bundled.sources;
const STARTER_URLS = ['https://api.xinlangapi.com/xinlangapi.php/provide/vod', 'https://api.zuidapi.com/api.php/provide/vod', 'https://bfzyapi.com/api.php/provide/vod'];

/** Seed only a genuinely new browser, never an existing user's deliberate empty selection. */
export function firstVisitSources(hasSavedSettings: boolean, current: {
  customAPIs: SourceConfig[]; envSources: SourceConfig[]; subscriptions: unknown[];
}): CatalogSource[] {
  if (hasSavedSettings || current.customAPIs.length || current.envSources.length || current.subscriptions.length) return [];
  return PUBLIC_SOURCES.filter(s => STARTER_URLS.includes(s.url));
}

export const SOURCE_CATALOGS = [
  { name: '项目内置公共列表（无需访问 GitHub）', url: BUNDLED_CATALOG_URL },
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
