import { guardRequest, jsonError } from '@/lib/api-guard';
import { queryTelegramCatalog } from '@/lib/telegram-index';
import { AI_CATEGORIES } from '@/lib/telegram-catalog';
import { validTelegramId } from '@/lib/telegram-public';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const guarded = guardRequest(req); if (guarded) return guarded;
  try {
    return Response.json(await queryTelegramCatalog(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonError('频道读取失败，请检查服务器的 Telegram 网络连接后重试。', 502);
  }
}
export async function POST(req:Request) {
  const guarded=guardRequest(req);if(guarded)return guarded;
  let body;
  try { body=await req.json(); } catch { return jsonError('无效的查询',400); }
  if(!body||typeof body!=='object'||Array.isArray(body))return jsonError('无效的查询',400);
  const {query='',category='全部',page=1,remoteBefore='',remote=true}=body || {};
  if(typeof query!=='string' || query.length>100 || typeof category!=='string' || !AI_CATEGORIES.includes(category) ||
    !Number.isInteger(page) || page<1 || page>10000 || typeof remote!=='boolean' || typeof remoteBefore!=='string' || (remoteBefore&&!validTelegramId(remoteBefore)))return jsonError('无效的查询参数',400);
  try { return Response.json(await queryTelegramCatalog(query.trim(),category,page,remoteBefore,remote),{headers:{'Cache-Control':'no-store'}}); }
  catch { return jsonError('频道目录读取失败，请稍后重试。',502); }
}
