import { isAdultContent } from './cms-parser';

export const BROWSE_GROUPS = [
  { id: 'short', name: '短剧' },
  { id: 'ai', name: 'AI短剧 / AI漫剧' },
  { id: 'comic', name: '漫剧 / 动态漫' },
  { id: 'movie', name: '电影' },
  { id: 'series', name: '电视剧' },
  { id: 'animation', name: '动漫' },
  { id: 'variety', name: '综艺' },
  { id: 'documentary', name: '纪录片' },
  { id: 'thriller', name: '惊悚 / 恐怖' },
  { id: 'other', name: '其他' },
] as const;
export type BrowseGroup = typeof BROWSE_GROUPS[number]['id'];
export interface BrowseCategory { id: string; name: string; parentId: string; group: BrowseGroup }

export function isExcludedCategory(name: string): boolean {
  return isAdultContent(name) || /理论片|理論片|伦理|倫理|色情|情色|三级片|三級片|成人|里番|裏番|18禁/i.test(name);
}

function classify(name: string): BrowseGroup | undefined {
  if (/AI|ＡＩ|人工智能/i.test(name) && /漫|剧|劇/.test(name)) return 'ai';
  if (/漫剧|漫劇|动态漫|動態漫/.test(name)) return 'comic';
  if (/短剧|短劇|微剧|微劇/.test(name)) return 'short';
  if (/恐怖|惊悚|驚悚/.test(name)) return 'thriller';
  if (/纪录|紀錄|记录片/.test(name)) return 'documentary';
  if (/动漫|動漫|动画|動畫/.test(name)) return 'animation';
  if (/综艺|綜藝/.test(name)) return 'variety';
  if (/电影解说|電影解說|预告|預告|体育|體育/.test(name)) return 'other';
  if (/连续剧|連續劇|电视剧|電視劇|国产剧|國產劇|欧美剧|歐美劇|港剧|港劇|香港剧|韓劇|韩剧|韩国剧|日剧|日本剧|台剧|台湾剧|海外剧|泰剧|泰国剧/.test(name)) return 'series';
  if (/电影|電影|片$/.test(name)) return 'movie';
  return undefined;
}

/** Class IDs are source-local. Inherit parent genres, but never infer AI from ordinary animation. */
export function parseBrowseCategories(data: unknown): BrowseCategory[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { class?: unknown }).class)) {
    throw new Error('这个源没有提供可用的分类列表，请切换数据源');
  }
  const raw = (data as { class: unknown[] }).class.slice(0, 500);
  const nodes = new Map<string, { id: string; name: string; parentId: string }>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const id = String(c.type_id ?? '');
    const name = typeof c.type_name === 'string' ? c.type_name.trim() : '';
    if (!/^\d{1,12}$/.test(id) || !name || name.length > 100) continue;
    nodes.set(id, { id, name, parentId: String(c.type_pid ?? '0') });
  }
  const result: BrowseCategory[] = [];
  for (const node of nodes.values()) {
    const seen = new Set<string>();
    let cursor: typeof node | undefined = node;
    let group: BrowseGroup | undefined;
    let excluded = false;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      if (isExcludedCategory(cursor.name)) excluded = true;
      group ??= classify(cursor.name);
      cursor = nodes.get(cursor.parentId);
    }
    if (!excluded) result.push({ ...node, group: group || 'other' });
  }
  return result;
}

export function positivePage(value: unknown, fallback = 1): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(100000, Math.floor(n)) : fallback;
}
