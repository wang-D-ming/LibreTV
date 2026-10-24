import { guardRequest, jsonError } from '@/lib/api-guard';
import { getTelegramMedia, telegramFetch } from '@/lib/telegram-server';
import { validTelegramId } from '@/lib/telegram-public';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const guarded = guardRequest(req); if (guarded) return guarded;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!validTelegramId(id)) return jsonError('无效的视频编号', 400);
  const range = req.headers.get('range') || undefined;
  if (range && !/^bytes=\d*-\d*$/.test(range)) return jsonError('不支持的播放范围', 400);
  try {
    let url = await getTelegramMedia(id);
    if (!url) return jsonError('此视频没有公开预览', 404);
    let res = await telegramFetch(url, range, req.signal);
    if ([401,403,404].includes(res.status)) {
      await res.body?.cancel();
      url = await getTelegramMedia(id, true);
      if (!url) return jsonError('此视频没有公开预览', 404);
      res = await telegramFetch(url, range, req.signal);
    }
    if (res.status === 416) {
      const cr = res.headers.get('content-range');
      await res.body?.cancel();
      return new Response(null, { status:416, headers: cr ? { 'Content-Range':cr } : {} });
    }
    if (!res.ok || !res.headers.get('content-type')?.match(/video|octet-stream/i)) {
      await res.body?.cancel();
      return jsonError('视频暂时无法播放，请刷新后重试', 502);
    }
    const headers = new Headers({ 'Content-Type':'video/mp4', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' });
    for (const key of ['content-length','content-range','accept-ranges']) {
      const value = res.headers.get(key); if (value) headers.set(key,value);
    }
    return new Response(res.body as unknown as ReadableStream<Uint8Array>, { status:res.status, headers });
  } catch { return jsonError('视频连接失败，请检查服务器代理并重试', 502); }
}
