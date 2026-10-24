import { guardRequest, jsonError } from '@/lib/api-guard';
import { getTelegramSyncStatus, startTelegramSync, stopTelegramSync } from '@/lib/telegram-index';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
  const guarded=guardRequest(req);if(guarded)return guarded;
  try{return Response.json(await getTelegramSyncStatus(),{headers:{'Cache-Control':'no-store'}});}
  catch{return jsonError('无法读取同步进度，请检查服务器数据目录。',502);}
}
export async function POST(req:Request) {
  const guarded=guardRequest(req);if(guarded)return guarded;
  const body=await req.json().catch(()=>null);
  if(!['start','stop'].includes(body?.action))return jsonError('无效的同步操作',400);
  try{return Response.json(body.action==='stop'?await stopTelegramSync():await startTelegramSync());}
  catch{return jsonError('无法启动同步，请检查服务器数据目录。',502);}
}
