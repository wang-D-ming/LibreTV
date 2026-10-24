import { fetch as upstreamFetch, ProxyAgent } from 'undici';
import { allowedTelegramMedia, parseTelegramPage, validTelegramId } from './telegram-public';

const proxy = process.env.TELEGRAM_PROXY_URL || process.env.HTTPS_PROXY;
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
const pages = new Map<string, { expires: number; data: ReturnType<typeof parseTelegramPage> }>();

export async function telegramFetch(url: string, range?: string, signal?: AbortSignal) {
  const target = new URL(url);
  if (!(target.origin === 'https://t.me' && /^\/s\/aidjtv(?:\/\d+)?$/.test(target.pathname)) && !allowedTelegramMedia(url)) throw new Error('不支持的频道地址');
  return upstreamFetch(url, {
    dispatcher, redirect: 'error',
    headers: { 'User-Agent': 'Mozilla/5.0', ...(range ? { Range: range } : {}) },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(25_000),
  });
}

export async function getTelegramPage(before = '', refresh = false, post = '', query = '') {
  if ((before && !validTelegramId(before)) || (post && !validTelegramId(post))) throw new Error('无效的消息编号');
  const key = post ? `post:${post}` : `${query}:${before}`;
  const cached = pages.get(key);
  if (!refresh && cached && cached.expires > Date.now()) return cached.data;
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (query) params.set('q', query.slice(0,100));
  const url = `https://t.me/s/aidjtv${post ? `/${post}` : ''}${params.size ? `?${params}` : ''}`;
  const res = await telegramFetch(url);
  if (!res.ok) throw new Error('频道暂时无法访问');
  const html = await res.text();
  if (html.length > 3_000_000) throw new Error('频道页面过大');
  const data = parseTelegramPage(html);
  if (!data.valid) throw new Error('未读取到频道页面，请稍后重试');
  if (pages.size >= 80) pages.delete(pages.keys().next().value!);
  pages.set(key, { expires: Date.now() + 120_000, data });
  return data;
}

export async function getTelegramMedia(id: string, refresh = false): Promise<string | undefined> {
  if (!refresh) for (const page of pages.values()) {
    if (page.expires > Date.now() && page.data.media[id]) return page.data.media[id];
  }
  const page = await getTelegramPage('', refresh, id);
  return page.media[id];
}
