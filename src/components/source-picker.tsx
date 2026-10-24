'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { BUNDLED_CATALOG_URL, PUBLIC_SOURCES, SOURCE_CATALOGS, mergeCatalogSources, sourceIdentity, type CatalogSource } from '@/lib/source-catalog';
import { parseSourceListPayload } from '@/lib/source-list';
import { isInDisabledSubscription, isSourceDisabled, keyBelongsToSubscription, subKeyPrefix, useAppStore } from '@/lib/store';
import { useAuth } from './auth';
import { Icon } from './icon';
import { SourceManagerDrawer } from './source-manager';

type CatalogCache = { sources: CatalogSource[]; updatedAt: number };
const useCatalogCache = create(persist<{
  lists: Record<string, CatalogCache>;
  save: (url: string, value: CatalogCache) => void;
}>((set) => ({
  lists: {},
  save: (url, value) => set((s) => ({ lists: { ...s.lists, [url]: value } })),
}), { name: 'libretv-source-catalogs' }));

export function SourcePicker() {
  const store = useAppStore();
  const lists = useCatalogCache((s) => s.lists);
  const { verified, openLogin } = useAuth();
  const queryClient = useQueryClient();
  const [catalogUrl, setCatalogUrl] = useState(SOURCE_CATALOGS[0].url);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const refreshing = useRef(false);
  useEffect(() => setReady(true), []);

  const catalogs = useMemo(() => {
    const unique = new Map(SOURCE_CATALOGS.map((c) => [c.url, c]));
    for (const sub of store.subscriptions) {
      if (!unique.has(sub.url)) unique.set(sub.url, { name: sub.name || '我的订阅', url: sub.url });
    }
    return [...unique.values()];
  }, [store.subscriptions]);
  const cache = ready ? lists[catalogUrl] : undefined;
  const all = ready ? mergeCatalogSources([...store.envSources, ...store.customAPIs], cache?.sources || (catalogUrl === BUNDLED_CATALOG_URL ? PUBLIC_SOURCES : [])) : [];
  const visible = all.filter((s) => !(s.isAdult && store.yellowFilter) &&
    `${s.name} ${s.url}`.toLowerCase().includes(query.trim().toLowerCase()));
  const isActive = (s: CatalogSource & { key?: string }) => Boolean(s.key && store.selectedKeys.includes(s.key) &&
    !isSourceDisabled(store, s.key) && !isInDisabledSubscription(store, s.key) && !(s.isAdult && store.yellowFilter));
  const activeCount = all.filter(isActive).length;

  async function refresh() {
    if (!verified) { openLogin(); return; }
    if (refreshing.current) return;
    refreshing.current = true;
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      let result;
      if (catalogUrl === BUNDLED_CATALOG_URL) {
        const res = await fetch(BUNDLED_CATALOG_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`公共列表读取失败 (${res.status})`);
        result = parseSourceListPayload(await res.json());
      } else result = await api.fetchSourceList(catalogUrl);
      if (!result.sources.length) throw new Error('这份列表没有点播源，请选择其他列表');
      const sources = mergeCatalogSources([], result.sources);
      useCatalogCache.getState().save(catalogUrl, { sources, updatedAt: Date.now() });
      setMessage(`已刷新 ${sources.length} 个点播源，勾选后即可搜索`);
      setExpanded(true);
    } catch (err) {
      setError(true);
      setMessage(`刷新失败：${err instanceof Error ? err.message : '网络连接失败'}。已有列表和选择已保留，请稍后重试。`);
    } finally {
      refreshing.current = false;
      setBusy(false);
    }
  }

  function toggle(source: CatalogSource & { key?: string }) {
    if (!verified) { openLogin(); return; }
    const current = useAppStore.getState();
    const saved = [...current.envSources, ...current.customAPIs].find((s) => sourceIdentity(s.url) === sourceIdentity(source.url));
    if (!saved) {
      current.addCustomApi({ name: source.name, url: source.url, detail: source.detail, isAdult: source.isAdult });
      return;
    }
    if (isActive(saved)) {
      current.setSelectedKeys(current.selectedKeys.filter((key) => key !== saved.key));
    } else {
      current.clearSourceHealth(saved.key);
      for (const sub of current.subscriptions) {
        if (keyBelongsToSubscription(saved.key, subKeyPrefix(sub.url))) current.setSubscriptionEnabled(sub.url, true);
      }
      current.setSelectedKeys([...new Set([...current.selectedKeys, saved.key])]);
      void queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  }

  return (
    <section aria-label="选择数据源" className="w-full max-w-2xl mt-4 rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="text-sm font-medium text-content flex items-center gap-2" aria-expanded={expanded} aria-controls="source-picker-panel" onClick={() => setExpanded(!expanded)}>
          <Icon name="link" className="w-4 h-4 text-accent" />选择数据源
          <span className="text-xs text-accent">已选 {activeCount} 个</span>
          <span className="text-faint text-xs">{expanded ? '收起' : '展开'}</span>
        </button>
        <button type="button" className="text-xs text-muted hover:text-accent" onClick={() => setManagerOpen(true)}>管理数据源</button>
      </div>
      {expanded && <div id="source-picker-panel" className="mt-3 space-y-3">
        <p className="text-xs text-muted">已内置公共源，勾选即用。首次访问默认启用 3 个，旧设置保留；远程列表可切换刷新。</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="数据源列表" value={catalogUrl} disabled={busy} onChange={(e) => { setCatalogUrl(e.target.value); setMessage(''); }} className="min-w-0 flex-1 rounded-lg border border-line bg-chip px-3 py-2 text-sm text-content">
            {catalogs.map((catalog) => <option key={catalog.url} value={catalog.url}>{catalog.name}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={refresh} className="btn-primary btn-sm disabled:opacity-60">
            <Icon name="refresh" className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />{busy ? '刷新中…' : '一键刷新数据源'}
          </button>
        </div>
        <div role="status" aria-live="polite" className={`text-xs ${error ? 'text-warning' : 'text-muted'}`}>
          {message || (cache ? `列表更新于 ${new Date(cache.updatedAt).toLocaleString('zh-CN')} · 来源为社区维护，播放情况以实际搜索为准` : '点击“一键刷新数据源”获取列表，也可在管理中添加自己的订阅。')}
        </div>
        {all.length > 0 && <>
          <input aria-label="筛选数据源" placeholder="搜索数据源名称…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-line bg-chip px-3 py-2 text-sm text-content" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {visible.map((source) => {
              const active = isActive(source);
              const paused = source.key && (isSourceDisabled(store, source.key) || isInDisabledSubscription(store, source.key));
              return <label key={sourceIdentity(source.url)} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer ${active ? 'border-accent bg-accent/10' : 'border-line bg-chip hover:bg-hover'}`}>
                <input type="checkbox" aria-label={`使用 ${source.name}`} checked={active} onChange={() => toggle(source)} className="accent-sky-500 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-content">{source.name}</span><span className="block truncate text-xs text-faint">{source.url.replace(/^https?:\/\//, '').split('/')[0]}</span></span>
                <span className="text-xs text-muted shrink-0">{active ? '使用中' : paused ? '点击恢复' : '未选择'}</span>
              </label>;
            })}
          </div>
          {visible.length === 0 && <p className="text-xs text-muted">没有匹配的数据源，请换个关键词。</p>}
        </>}
      </div>}
      <SourceManagerDrawer open={managerOpen} onClose={() => setManagerOpen(false)} />
    </section>
  );
}
