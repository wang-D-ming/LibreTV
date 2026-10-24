'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { AI_CATEGORIES, type TelegramCatalogResult, type TelegramDrama } from '@/lib/telegram-catalog';
import type { TelegramEpisode } from '@/lib/telegram-public';

export default function TelegramChannelPage() {
  const [input,setInput]=useState('');
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('全部');
  const [page,setPage]=useState(1);
  const [remoteBefore,setRemoteBefore]=useState('');
  const [expanded,setExpanded]=useState('');
  const [syncBusy,setSyncBusy]=useState(false);
  const [actionError,setActionError]=useState('');
  const [selected,setSelected]=useState<{drama:TelegramDrama;episode:TelegramEpisode}|null>(null);
  const [playError,setPlayError]=useState('');
  const [retry,setRetry]=useState(0);
  const [loading,setLoading]=useState(false);

  const catalog=useQuery<TelegramCatalogResult>({
    queryKey:['telegram-catalog',query,category,page,remoteBefore],
    queryFn:async({signal})=>{
      const res=await fetch('/api/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,category,page,remoteBefore}),signal});
      const json=await res.json();if(!res.ok)throw new Error(json.error||'目录读取失败');return json;
    },
    refetchInterval:q=>q.state.data?.sync.running?5000:false,
    staleTime:0,
  });
  const data=catalog.data;
  const sync=data?.sync;
  async function syncAction(action:'start'|'stop') {
    setSyncBusy(true);setActionError('');
    try {
      const res=await fetch('/api/telegram/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
      const json=await res.json();if(!res.ok)throw new Error(json.error||'同步操作失败');
      await catalog.refetch();
    } catch(e) {setActionError(e instanceof Error?e.message:'同步操作失败');}
    finally {setSyncBusy(false);}
  }
  useEffect(()=>{
    if(!loading)return;
    const timer=setTimeout(()=>{setPlayError('视频加载较慢，请重试或检查服务器代理。');setLoading(false);},30000);
    return()=>clearTimeout(timer);
  },[loading,selected,retry]);
  function play(drama:TelegramDrama,episode:TelegramEpisode) {
    setSelected({drama,episode});setPlayError('');setRetry(0);setLoading(true);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function search() {
    const next=input.trim();
    setQuery(next);setPage(1);setRemoteBefore('');setExpanded('');
    if(next===query&&page===1&&!remoteBefore)void catalog.refetch();
  }

  return <div className="min-h-screen"><Header />
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div><span className="text-xs text-accent font-semibold">AI 专区 · @aidjtv</span><h1 className="text-2xl font-bold mt-1">AI 短剧片库</h1><p className="text-sm text-muted mt-2">全频道搜索 · 按题材找剧 · 免 Telegram 登录</p></div>
        <button className="btn-primary" disabled={syncBusy} onClick={()=>void syncAction(sync?.running?'stop':'start')}>
          {syncBusy?'正在处理…':sync?.running?'暂停同步':sync?.complete?'同步频道更新':sync?.pages?'继续同步全频道':'同步全频道 AI 短剧'}
        </button>
      </div>
      <section className="card p-4 space-y-2" aria-label="同步进度">
        <p className="text-sm font-medium">{sync?.running?'正在同步 AI 短剧目录…':sync?.complete?'公开 AI 短剧目录已同步完成':sync?.pages?'同步已暂停，可从上次进度继续':'首次使用可同步整个频道的 AI 短剧目录'}</p>
        <p className="text-sm text-muted">{sync?`${sync.dramas} 部 AI 短剧 · ${sync.episodes} 个视频条目 · ${sync.available} 个有公开预览 · 已扫描 ${sync.pages} 页`:'正在读取目录…'}</p>
        <p className="text-xs text-muted">仅收录频道标注为 AI 短剧 / AI 漫剧的内容。同步保存目录，不会批量下载视频；关闭页面后仍会继续，重启服务后可续传。部分视频没有网页预览。</p>
        {sync?.error&&<p className="text-warning text-sm" role="alert">{sync.error}</p>}
      </section>
      {selected&&<section className="card p-4 space-y-3" aria-label="频道播放器">
        <div className="flex justify-between gap-3"><h2 className="font-semibold">{selected.drama.title} · {selected.episode.label}</h2><button className="btn-ghost btn-sm" onClick={()=>{setSelected(null);setLoading(false);}}>关闭播放</button></div>
        <video key={`${selected.episode.id}-${retry}`} controls autoPlay playsInline preload="metadata" className="w-full max-h-[65vh] bg-black rounded-lg" src={`/api/telegram/video?id=${selected.episode.id}&retry=${retry}`}
          onPlaying={()=>{setLoading(false);setPlayError('');}}
          onError={()=>{setLoading(false);setPlayError('这段视频暂时无法播放，请重试或查看原消息。');}}
          onEnded={()=>{const list=selected.drama.episodes.filter(e=>e.available);const next=list[list.findIndex(e=>e.id===selected.episode.id)+1];if(next)play(selected.drama,next);}} />
        {loading&&<p className="text-sm text-muted" role="status">正在连接视频…</p>}
        {playError&&<p className="text-sm text-warning" role="alert">{playError} <button className="underline" onClick={()=>{setRetry(r=>r+1);setPlayError('');setLoading(true);}}>重试播放</button></p>}
        <a className="text-sm text-accent" href={`https://t.me/aidjtv/${selected.episode.id}`} target="_blank" rel="noreferrer">查看原消息</a>
      </section>}
      <form className="flex gap-2" onSubmit={e=>{e.preventDefault();search();}}>
        <input aria-label="搜索全频道 AI 短剧" className="input flex-1 min-w-0" maxLength={100} placeholder="搜索全频道的剧名、题材或简介…" value={input} onChange={e=>setInput(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={catalog.isFetching}>搜索全频道</button>
        {query&&<button type="button" className="btn-ghost shrink-0" onClick={()=>{setInput('');setQuery('');setPage(1);setRemoteBefore('');}}>清空</button>}
      </form>
      <p className="text-xs text-muted">搜索同时查询频道公开历史和本地同步目录，不受当前页面已加载内容限制。题材依据频道标签与简介自动归类，可同时属于多个分类。</p>
      {sync&&!sync.complete&&<p className="text-xs text-muted">完整目录尚未同步完成。在线搜索会先返回 Telegram 可查询到的匹配项；完成同步后，搜索和分类将覆盖已遍历的全部公开 AI 短剧。</p>}
      <div className="flex flex-wrap gap-2" aria-label="AI 短剧分类">{AI_CATEGORIES.map(name=>{
        const count=data?.categories.find(c=>c.name===name)?.count;
        return <button key={name} aria-pressed={category===name} className={category===name?'btn-primary btn-sm':'btn-ghost btn-sm'} onClick={()=>{setCategory(name);setPage(1);setExpanded('');}}>{name}{count!==undefined?` ${count}`:''}</button>;
      })}</div>
      {data?.remoteError&&<div role="alert" className="card p-3 text-warning text-sm">{data.remoteError} <button className="underline" onClick={()=>void catalog.refetch()}>重试在线搜索</button></div>}
      {(actionError||catalog.error)&&<div role="alert" className="text-warning">{actionError||catalog.error?.message} <button className="underline" onClick={()=>void catalog.refetch()}>重试</button></div>}
      <p className="text-sm text-muted">{catalog.isFetching?'正在查询…':`找到 ${data?.total??0} 部 AI 短剧`}{query&&` · “${query}”`}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">{data?.groups.map(drama=><article key={drama.title} className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold">{drama.title}</h2>
        <div className="flex flex-wrap gap-2">{drama.categories.map(name=><span className="text-xs text-accent bg-chip px-2 py-1 rounded" key={name}>{name}</span>)}</div>
        <p className="text-sm text-muted line-clamp-3">{drama.description.replace(/^#[^\n]*\n?/,'')}</p>
        <div className="flex flex-wrap justify-between items-center gap-2"><span className="text-xs text-muted">{drama.episodes.length} 个视频 · {drama.episodes.filter(e=>e.available).length} 个有预览</span><button className="btn-ghost btn-sm" aria-expanded={expanded===drama.title} onClick={()=>setExpanded(expanded===drama.title?'':drama.title)}>{expanded===drama.title?'收起选集':'展开选集'}</button></div>
        {expanded===drama.title&&<div className="flex flex-wrap gap-2 max-h-80 overflow-y-auto">{drama.episodes.map(episode=><button key={episode.id} disabled={!episode.available} title={`消息 ${episode.id}${episode.available?'':'：没有网页预览'}`} aria-pressed={selected?.episode.id===episode.id} className={selected?.episode.id===episode.id?'btn-primary btn-sm':'btn-ghost btn-sm'} onClick={()=>play(drama,episode)}>{episode.label}{!episode.available&&'（无预览）'}</button>)}</div>}
      </article>)}</div>
      {data?.total===0&&!catalog.isFetching&&<p className="py-6 text-muted">没有匹配的 AI 短剧。可换关键词或分类；未同步时先点击上方同步按钮建立分类目录。</p>}
      {data&&data.pageCount>1&&<div className="flex justify-center items-center gap-4"><button className="btn-ghost" disabled={catalog.isFetching||data.page<=1} onClick={()=>{setPage(data.page-1);setExpanded('');}}>上一页</button><span>{data.page} / {data.pageCount}</span><button className="btn-ghost" disabled={catalog.isFetching||data.page>=data.pageCount} onClick={()=>{setPage(data.page+1);setExpanded('');}}>下一页</button></div>}
      {query&&data?.remoteBefore&&<div className="text-center"><button className="btn-ghost" disabled={catalog.isFetching} onClick={()=>{setRemoteBefore(data.remoteBefore!);setPage(1);}}>继续搜索频道更早的匹配内容</button></div>}
    </main>
  </div>;
}
