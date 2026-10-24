import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { cmsRequestHeaders, parseSearchList } from '@/lib/cms-parser';
import { isExcludedCategory, parseBrowseCategories, positivePage, type BrowseCategory } from '@/lib/browse-categories';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import type { SourceConfig } from '@/lib/types';

export const runtime = 'nodejs';

async function fetchJson(url: URL, signal: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetchUpstream(url.href, { headers: cmsRequestHeaders(), signal, timeoutMs: 10000 });
  if (!res.ok) throw new Error(`源站返回 HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object') throw new Error('源站返回的数据格式无效');
  return data as Record<string, unknown>;
}

export async function POST(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch { return NextResponse.json({ error: '请求格式错误' }, { status: 400 }); }
  const input = body.source as Partial<SourceConfig> | undefined;
  if (!input || typeof input.url !== 'string' || input.url.length > 2048 ||
      typeof input.key !== 'string' || typeof input.name !== 'string' || input.isAdult) {
    return NextResponse.json({ error: '请选择有效的普通点播源' }, { status: 400 });
  }
  const source: SourceConfig = { key: input.key.slice(0, 150), name: input.name.slice(0, 100), url: input.url };
  if (body.category !== undefined && (typeof body.category !== 'string' || !/^\d{1,12}$/.test(body.category))) {
    return NextResponse.json({ error: '分类无效' }, { status: 400 });
  }
  if (body.page !== undefined && (!Number.isInteger(body.page) || Number(body.page) < 1 || Number(body.page) > 100000)) {
    return NextResponse.json({ error: '页码无效' }, { status: 400 });
  }
  const verdict = await checkUpstreamAllowed(source.url);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 403 });
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(18000)]);
    const url = new URL(source.url);
    for (const key of ['wd', 'ids', 't', 'pg', 'h']) url.searchParams.delete(key);
    url.searchParams.set('ac', 'list');
    const cacheKey = `browse-categories:${url.href}`;
    let categories = body.refresh === true ? undefined : getCache<BrowseCategory[]>(cacheKey);
    if (!categories) {
      categories = parseBrowseCategories(await fetchJson(url, signal));
      setCache(cacheKey, categories, 15 * 60 * 1000);
    }
    if (body.category === undefined) return NextResponse.json({ categories });
    const category = categories.find((c) => c.id === body.category);
    if (!category) return NextResponse.json({ error: '该分类不可浏览，请刷新分类列表' }, { status: 400 });
    url.searchParams.set('ac', 'videolist');
    url.searchParams.set('t', category.id);
    url.searchParams.set('pg', String(body.page || 1));
    const data = await fetchJson(url, signal);
    if (!Array.isArray(data.list) && data.list !== null) throw new Error('源站返回的影片列表格式无效');
    const descendants = new Set([category.id]);
    // Some sources ignore the requested category; only retain that category and its descendants.
    for (let changed = true; changed;) {
      changed = false;
      for (const c of categories) {
        if (descendants.has(c.parentId) && !descendants.has(c.id)) {
          descendants.add(c.id);
          changed = true;
        }
      }
    }
    const allowedNames = new Set(categories.filter((c) => descendants.has(c.id)).map((c) => c.name));
    const rawList = (Array.isArray(data.list) ? data.list : []).slice(0, 200).filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const vod = item as Record<string, unknown>;
      if (isExcludedCategory(String(vod.type_name || ''))) return false;
      return vod.type_id === undefined
        ? typeof vod.type_name === 'string' && allowedNames.has(vod.type_name)
        : descendants.has(String(vod.type_id));
    });
    const list = parseSearchList({ list: rawList }, source).filter((item) => item.vodId && item.name);
    return NextResponse.json({
      list, category, page: positivePage(body.page), pageCount: positivePage(data.pagecount),
      total: Number.isFinite(Number(data.total)) ? Math.max(0, Number(data.total)) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '分类加载失败，请稍后重试' }, { status: 502 });
  }
}
