'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { BROWSE_GROUPS, type BrowseGroup } from '@/lib/browse-categories';
import type { SearchResultItem, SourceConfig } from '@/lib/types';
import { useAuth } from './auth';
import { aggregateResults, AggregatedCard } from './video-card';
import { EmptyState, ErrorState, LoadingState } from './states';

export function CategoryBrowser({ sources, onOpen }: { sources: SourceConfig[]; onOpen: (item: SearchResultItem) => void }) {
  const [sourceKey, setSourceKey] = useState('');
  const eligible = sources.filter((s) => !s.isAdult);
  const source = eligible.find((s) => s.key === sourceKey) || eligible[0];
  return <section aria-label="分类浏览" className="space-y-4 mb-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold text-content">分类浏览</h2><p className="text-xs text-muted mt-1">不必输入片名，点分类即可浏览。分类由各数据源提供。</p></div>
      {source && <label className="flex items-center gap-2 text-sm text-muted">浏览源
        <select aria-label="分类浏览数据源" value={source.key} onChange={(e) => setSourceKey(e.target.value)} className="max-w-56 rounded-lg border border-line bg-chip px-3 py-2 text-content">
          {eligible.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
      </label>}
    </div>
    {!source ? <EmptyState title="先选择一个数据源" description="在上方勾选点播源后，即可查看它提供的分类。" /> :
      <SourceCategories key={`${source.key}:${source.url}`} source={source} onOpen={onOpen} />}
  </section>;
}

function SourceCategories({ source, onOpen }: { source: SourceConfig; onOpen: (item: SearchResultItem) => void }) {
  const { verified } = useAuth();
  const [group, setGroup] = useState<BrowseGroup>('short');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const catalog = useQuery({
    queryKey: ['browse-categories', source.url, refreshIndex],
    queryFn: ({ signal }) => api.categories(source, refreshIndex > 0, signal),
    enabled: verified, staleTime: 15 * 60_000, retry: false,
  });
  const categories = catalog.data?.categories || [];
  const inGroup = categories.filter((c) => c.group === group);
  // Many CMS endpoints return no videos for a grouping parent; start with a real leaf category.
  const category = inGroup.find((c) => c.id === categoryId) ||
    inGroup.find((c) => !inGroup.some((child) => child.parentId === c.id)) || inGroup[0];
  const videos = useQuery({
    queryKey: ['browse-videos', source.key, source.url, category?.id, page, refreshIndex],
    queryFn: ({ signal }) => api.browse(source, category!.id, page, signal),
    enabled: verified && Boolean(category), staleTime: 60_000, retry: false,
  });
  const groups = useMemo(() => aggregateResults(videos.data?.list || []), [videos.data]);
  return <>
    <div className="flex flex-wrap gap-2" aria-label="影片类型">
      {BROWSE_GROUPS.map((g) => <button type="button" key={g.id} aria-pressed={group === g.id}
        onClick={() => { setGroup(g.id); setCategoryId(''); setPage(1); }}
        className={`rounded-full px-3 py-2 text-sm transition-colors ${group === g.id ? 'bg-accent text-black font-medium' : 'bg-chip text-muted hover:text-content'}`}>
        {g.name}{catalog.data && <span className="ml-1 text-xs opacity-70">{categories.filter((c) => c.group === g.id).length}</span>}
      </button>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <p>{source.name} · 数字表示分类数，不是影片数量。未提供年龄分级。</p>
      <button type="button" disabled={catalog.isFetching} className="text-accent disabled:opacity-50" onClick={() => { setRefreshIndex((i) => i + 1); setPage(1); setCategoryId(''); }}>刷新分类</button>
    </div>
    {catalog.isFetching ? <LoadingState label="正在读取源站分类…" /> : catalog.isError ?
      <ErrorState message={catalog.error.message} onRetry={() => void catalog.refetch()} /> : !verified ?
      <EmptyState title="登录后查看分类" /> : !category ?
      <EmptyState title={`这个源暂无“${BROWSE_GROUPS.find((g) => g.id === group)?.name}”分类`} description="可以切换浏览源，或选择其他类型。普通动漫不会被自动标为 AI 漫剧。" /> : <>
        <div className="flex flex-wrap gap-2" aria-label="源站分类">
          {inGroup.map((c) => <button type="button" key={c.id} aria-pressed={category.id === c.id} onClick={() => { setCategoryId(c.id); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm border ${category.id === c.id ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted hover:text-content'}`}>{c.name}</button>)}
        </div>
        {videos.isFetching ? <LoadingState label={`正在加载${category.name}…`} /> : videos.isError ?
          <ErrorState message={videos.error.message} onRetry={() => void videos.refetch()} /> : <>
            <p role="status" className="text-xs text-muted">{category.name} · 第 {page} / {videos.data?.pageCount || 1} 页 · 本页 {groups.length} 部{videos.data?.total != null ? ` · 源站共 ${videos.data.total.toLocaleString()} 条` : ''}</p>
            {groups.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              {groups.map((g) => <AggregatedCard key={g.key} group={g} sources={[source]} onOpen={onOpen} />)}
            </div> : <EmptyState title="这一页没有可展示的影片" description="部分父分类仅用于分组，请选择具体子分类，也可以换页或更换数据源。" />}
          </>}
        <div className="flex items-center justify-center gap-4">
          <button type="button" className="btn-ghost btn-sm disabled:opacity-40" disabled={page <= 1 || videos.isFetching} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span className="text-sm text-muted">第 {page} 页</span>
          <button type="button" className="btn-ghost btn-sm disabled:opacity-40" disabled={!videos.data || page >= videos.data.pageCount || videos.isFetching} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      </>}
  </>;
}
