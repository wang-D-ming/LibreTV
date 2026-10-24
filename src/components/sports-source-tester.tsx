'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api, type LiveProbeResult } from '@/lib/client-api';
import { SPORTS_PLAYLIST, SPORTS_SOURCES, type SportsSource } from '@/lib/sports-sources';
import { normalizeStreamUrl } from '@/lib/m3u-parser';

interface PlaybackCheck { ok: boolean; width?: number; height?: number; seconds?: number; error?: string }
interface TestRecord { at: number; probe?: LiveProbeResult; playback?: PlaybackCheck; playbackAt?: number }
const STORAGE = 'libretv-sports-tests-v1';

/** Connection checks and actual decoding are deliberately reported independently. */
export function SportsSourceTester({ onWatch }: { onWatch: (source: SportsSource) => void }) {
  const [sources, setSources] = useState<SportsSource[]>(SPORTS_SOURCES);
  const [records, setRecords] = useState<Record<string, TestRecord>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [onlyReachable, setOnlyReachable] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{ source: SportsSource; run: number } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const refreshingRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (saved && Array.isArray(saved.sources)) {
        const valid = saved.sources.filter((s: SportsSource) => s && typeof s.name === 'string' && typeof s.url === 'string' && normalizeStreamUrl(s.url)).slice(0, 50);
        if (valid.length) setSources(valid);
        if (saved.records && typeof saved.records === 'object') setRecords(saved.records);
      }
    } catch { /* A broken or unavailable local cache must not prevent testing. */ }
    setLoaded(true);
    return () => { operation.current?.abort(); refreshingRef.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ sources, records })); } catch { /* Storage may be unavailable. */ }
  }, [sources, records, loaded]);

  const visible = sources.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()) && (!onlyReachable || records[s.url]?.probe?.ok || records[s.url]?.playback?.ok));

  const test = async (targets: SportsSource[]) => {
    if (!targets.length || busy) return;
    const abort = new AbortController(); operation.current = abort;
    setBusy(true); setMessage('正在重新检测连接，本次不使用旧的测活缓存…');
    try {
      await api.liveProbeStream(targets.map(s => s.url), result => {
        if (!abort.signal.aborted) setRecords(prev => ({ ...prev, [result.url]: { at: Date.now(), probe: result } }));
      }, abort.signal, true);
      if (!abort.signal.aborted) setMessage('连接检测完成。点击“验证画面”检查是否真正可播。');
    } catch (err) {
      if (!abort.signal.aborted) setMessage(`检测中断：${err instanceof Error ? err.message : '请重试'}`);
    } finally { if (operation.current === abort) { setBusy(false); operation.current = null; } }
  };

  const refresh = async () => {
    if (refreshing || busy) return;
    const abort = new AbortController(); refreshingRef.current = abort;
    setRefreshing(true); setMessage('正在从公开体育列表更新候选地址…');
    try {
      const playlist = await api.livePlaylist(SPORTS_PLAYLIST, true, abort.signal);
      const candidates = playlist.channels.filter(c => /football|soccer|bein|fifa|golazo|arena sport|sport tv|tnt sport|sky sports (?:main|premier|football)|match! ultra|4k|uhd/i.test(c.name));
      // Rotate frequently changing public addresses, while retaining user-added sources.
      setSources(prev => {
        const custom = prev.filter(s => s.custom);
        const seen = new Set(custom.map(s => s.url));
        const next = candidates.filter(s => !seen.has(s.url) && !!seen.add(s.url)).slice(0, 50 - custom.length).map(({ name, url }) => ({ name, url }));
        return next.length ? [...custom, ...next] : prev;
      });
      setMessage(candidates.length ? '候选地址已更新；列表名称和清晰度标注仍需实际验证。' : '没有找到匹配频道，已保留原列表。');
    } catch (err) {
      if (!abort.signal.aborted) setMessage(`更新失败，已保留原列表：${err instanceof Error ? err.message : '请重试'}`);
    } finally { setRefreshing(false); refreshingRef.current = null; }
  };

  const recordPlayback = useCallback((sourceUrl: string, result: PlaybackCheck) => {
    setRecords(prev => ({ ...prev, [sourceUrl]: { ...prev[sourceUrl], at: prev[sourceUrl]?.at || Date.now(), playbackAt: Date.now(), playback: result } }));
  }, []);

  return <section aria-label="体育源测试面板" className="border border-line bg-surface-raised rounded-xl p-4 mb-5">
    <h2 className="font-semibold text-content">体育源测试</h2>
    <p className="text-sm text-muted mt-2">晚上可重新测连接，再验证画面。实际解码达到 3840×2160 才标记为 4K；能播不代表当前正在转播英超、欧冠或意甲。</p>
    <div className="flex flex-wrap gap-2 my-3">
      <button className="btn-primary btn-sm" disabled={busy || refreshing || !visible.length} onClick={() => void test(visible)}>{busy ? '正在检测…' : `一键测试当前列表（${visible.length}）`}</button>
      {busy && <button className="btn-ghost btn-sm" onClick={() => { operation.current?.abort(); setMessage('已停止接收检测结果，已完成的结果保留。'); }}>停止检测</button>}
      <button className="btn-ghost btn-sm" disabled={refreshing || busy} onClick={() => void refresh()}>{refreshing ? '更新中…' : '刷新候选源'}</button>
      <button className="btn-ghost btn-sm" disabled={busy || refreshing} onClick={() => { setSources(SPORTS_SOURCES); setMessage('已恢复初始候选列表。'); }}>恢复初始列表</button>
    </div>
    <p className="text-xs text-muted break-words" role="status">{message || '尚未检测的源不代表可用。检测结果保存在当前浏览器，复测会更新。'}</p>
    <div className="flex flex-wrap items-center gap-3 my-3">
      <input className="bg-chip border border-line rounded px-3 py-2 text-sm min-w-0 max-w-full" aria-label="筛选体育频道" placeholder="搜索频道名" value={filter} onChange={e => setFilter(e.target.value)} />
      <label className="text-sm text-muted flex items-center gap-2"><input type="checkbox" checked={onlyReachable} onChange={e => setOnlyReachable(e.target.checked)} />只看连接通过或已出画面</label>
    </div>
    <form className="flex flex-wrap gap-2 mb-4" onSubmit={e => {
      e.preventDefault(); const normalized = normalizeStreamUrl(url);
      if (!normalized) { setMessage('请输入完整的 http 或 https 直播流地址。'); return; }
      if (sources.some(s => s.url === normalized)) { setMessage('这个地址已在列表中。'); return; }
      if (sources.length >= 50) { setMessage('最多保留 50 个候选源，请先移除不需要的地址。'); return; }
      setSources(prev => [...prev, { name: name.trim().slice(0, 100) || '自定义体育源', url: normalized, custom: true }]); setUrl(''); setName(''); setMessage('已添加，可检测连接或验证画面。');
    }}>
      <input className="bg-chip border border-line rounded px-3 py-2 text-sm min-w-0 flex-1" aria-label="自定义频道名称" placeholder="频道名称（可选）" maxLength={100} value={name} onChange={e => setName(e.target.value)} />
      <input className="bg-chip border border-line rounded px-3 py-2 text-sm min-w-0 flex-[2]" aria-label="自定义直播地址" placeholder="粘贴直播流地址" value={url} maxLength={4096} onChange={e => setUrl(e.target.value)} />
      <button type="submit" className="btn-ghost btn-sm" disabled={busy || refreshing}>添加</button>
    </form>
    {preview && <PlaybackPreview key={preview.run} source={preview.source} onResult={recordPlayback} onClose={() => setPreview(null)} />}
    <div className="max-h-[560px] overflow-y-auto space-y-2">
      {!visible.length && <p className="text-sm text-muted py-5">当前筛选下没有候选源。</p>}
      {visible.map(source => {
        const r = records[source.url]; const p = r?.probe; const v = r?.playback;
        return <article key={source.url} className="border border-line rounded-lg p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-content break-words">{source.name}</h3>
              <p className="text-xs text-muted mt-1">{p ? p.ok ? p.level === 'segment' ? '分片连接通过' : '地址可达' : `连接失败：${p.error?.includes('timeout') || p.timedOut ? '请求超时' : p.error === 'fetch failed' ? '网络连接失败' : p.error || p.status || '未知原因'}` : '尚未检测连接'}</p>
              {v && <p className={v.ok ? 'text-xs text-accent mt-1' : 'text-xs text-warning mt-1'}>{v.ok ? `已出画面 · ${v.width}×${v.height}${(v.width || 0) >= 3840 && (v.height || 0) >= 2160 ? ' · 4K' : ' · 非4K'} · 已播放 ${v.seconds?.toFixed(1)} 秒` : `画面未验证通过：${v.error}`}</p>}
              <details className="text-xs text-faint mt-1"><summary className="cursor-pointer">查看直播地址</summary><p className="break-all select-all mt-1">{source.url}</p></details>
              {r && <p className="text-xs text-faint mt-1">连接检测：{p ? new Date(r.at).toLocaleString('zh-CN') : '尚未进行'}{r.playbackAt ? ` · 画面验证：${new Date(r.playbackAt).toLocaleString('zh-CN')}` : ''}</p>}
            </div>
            <div className="flex flex-wrap gap-1 shrink-0">
              <button className="btn-ghost btn-sm" disabled={busy} aria-label={`检测 ${source.name}`} onClick={() => void test([source])}>测连接</button>
              <button className="btn-ghost btn-sm" aria-label={`验证画面 ${source.name}`} onClick={() => setPreview({ source, run: Date.now() })}>验证画面</button>
              <button className="btn-ghost btn-sm" aria-label={`观看 ${source.name}`} onClick={() => onWatch(source)}>观看</button>
              {source.custom && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => { if (preview?.source.url === source.url) setPreview(null); setSources(prev => prev.filter(s => s.url !== source.url)); }}>移除</button>}
            </div>
          </div>
        </article>;
      })}
    </div>
    <p className="text-xs text-faint mt-3">候选列表来自 <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer" className="text-accent">iptv-org</a>。连接检测使用本地服务的网络，画面经本地服务转发；修改网络线路后请重新测试。</p>
  </section>;
}

function PlaybackPreview({ source, onResult, onClose }: { source: SportsSource; onResult: (url: string, result: PlaybackCheck) => void; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('正在加载，最长等待 25 秒…');
  useEffect(() => {
    const video = ref.current; if (!video) return;
    let settled = false; let disposed = false; let first: number | undefined;
    const finish = (result: PlaybackCheck) => {
      if (settled || disposed) return;
      settled = true;
      onResult(source.url, result);
      setStatus(result.ok ? `已出画面，实际解码 ${result.width}×${result.height}。可继续观察流畅度；关闭测试会停止播放。` : result.error || '播放失败');
    };
    const tick = () => {
      if (!video.paused && video.readyState >= 2 && video.videoWidth > 0) {
        first ??= video.currentTime;
        if (video.currentTime - first >= 2) finish({ ok: true, width: video.videoWidth, height: video.videoHeight, seconds: video.currentTime - first });
      }
    };
    const timer = setTimeout(() => { finish({ ok: false, error: '25 秒内没有连续播放画面，请复测或更换网络线路' }); if (!video.videoWidth) video.pause(); }, 25000);
    video.addEventListener('timeupdate', tick);
    const nativeError = () => finish({ ok: false, error: '浏览器无法解码或源连接失败' });
    video.addEventListener('error', nativeError);
    const play = () => void video.play().catch(() => setStatus('请点击播放器的播放按钮开始验证。'));
    const media = `/api/live/stream?url=${encodeURIComponent(source.url)}`;
    let hls: Hls | undefined;
    if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 12, maxMaxBufferLength: 20, backBufferLength: 10, manifestLoadingMaxRetry: 1, fragLoadingMaxRetry: 1 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!hls) return;
        hls.currentLevel = hls.levels.reduce((best, level, index) => level.height > hls!.levels[best].height ? index : best, 0);
        play();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (!settled) finish({ ok: false, error: `播放失败：${data.details}` });
          else setStatus(`后续播放中断：${data.details}。已保存的出画面记录仅代表此前短时验证。`);
          hls?.destroy();
        }
      });
      hls.loadSource(media); hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = media; video.addEventListener('loadedmetadata', play);
    } else finish({ ok: false, error: '当前浏览器不支持 HLS 直播播放' });
    return () => {
      disposed = true; clearTimeout(timer); video.removeEventListener('timeupdate', tick); video.removeEventListener('error', nativeError); video.removeEventListener('loadedmetadata', play);
      hls?.destroy(); video.pause(); video.removeAttribute('src'); video.load();
    };
  }, [source, onResult]);
  return <div className="border border-line rounded-lg p-3 mb-4">
    <div className="flex items-center justify-between gap-3 mb-2"><h3 className="text-sm font-semibold">画面验证 · {source.name}</h3><button className="btn-ghost btn-sm" onClick={onClose}>关闭测试</button></div>
    <video ref={ref} controls muted playsInline className="w-full max-h-[400px] aspect-video bg-black rounded" />
    <p className="text-sm text-muted mt-2" role="status">{status}</p>
  </div>;
}
