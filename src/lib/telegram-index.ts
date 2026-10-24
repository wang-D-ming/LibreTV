import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AI_CATEGORIES, AI_HISTORY_SCOPES, buildDramas, filterDramas, isAIShort, type TelegramCatalogResult, type TelegramSyncStatus } from './telegram-catalog';
import type { TelegramPost } from './telegram-public';
import { getTelegramPage } from './telegram-server';

interface Checkpoint { query:string; before:string; done:boolean }
interface DiskIndex { version:2; posts:TelegramPost[]; checkpoints:Checkpoint[]; complete:boolean; pages:number; updated:string }
interface IndexState { data:DiskIndex; ready:Promise<void>; writes:Promise<void>; running:boolean; stop:boolean; error:string }
const indexPath = path.join(process.env.TELEGRAM_DATA_DIR || path.join(process.cwd(), '.local'), 'telegram-index.json');
const singleton = globalThis as typeof globalThis & { libreTelegramIndex?: IndexState };
function freshCheckpoints(): Checkpoint[] { return AI_HISTORY_SCOPES.map(query => ({query,before:'',done:false})); }

async function state() {
  if (!singleton.libreTelegramIndex) {
    const value: IndexState = { data:{version:2,posts:[],checkpoints:freshCheckpoints(),complete:false,pages:0,updated:''}, ready:Promise.resolve(), writes:Promise.resolve(),running:false,stop:false,error:'' };
    singleton.libreTelegramIndex = value;
    value.ready = (async () => {
      try {
        const saved = JSON.parse(await readFile(indexPath,'utf8')) as DiskIndex;
        if (!Array.isArray(saved.posts) || !Array.isArray(saved.checkpoints)) throw new Error('目录格式错误');
        value.data = saved.version===2 ? saved : {...value.data,posts:saved.posts,updated:saved.updated};
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('无法读取频道目录，请检查数据文件权限或备份');
      }
    })();
  }
  await singleton.libreTelegramIndex.ready;
  return singleton.libreTelegramIndex;
}

async function save(value: IndexState) {
  const json = JSON.stringify(value.data);
  value.writes = value.writes.catch(() => {}).then(async () => {
    await mkdir(path.dirname(indexPath), {recursive:true});
    await writeFile(indexPath + '.tmp', json, 'utf8');
    await rename(indexPath + '.tmp', indexPath);
  });
  await value.writes;
}
function merge(value:IndexState, posts:TelegramPost[]) {
  const map = new Map(value.data.posts.map(p=>[p.id,p]));
  for (const post of posts) if (isAIShort(post)) map.set(post.id,post);
  value.data.posts = [...map.values()];
  value.data.updated = new Date().toISOString();
}
function status(value:IndexState): TelegramSyncStatus {
  const groups = buildDramas(value.data.posts);
  return {
    running:value.running,complete:value.data.complete,pages:value.data.pages,posts:value.data.posts.length,
    dramas:groups.length,episodes:groups.reduce((n,g)=>n+g.episodes.length,0),
    available:groups.reduce((n,g)=>n+g.episodes.filter(e=>e.available).length,0),
    updated:value.data.updated,error:value.error,currentTag:value.data.checkpoints.find(c=>!c.done)?.query || '',
  };
}
export async function getTelegramSyncStatus() { return status(await state()); }

/** One sequential worker per server process. Checkpoints and metadata survive page closes and restarts. */
async function sync(value:IndexState) {
  try {
    for (const checkpoint of value.data.checkpoints) {
      while (!checkpoint.done && !value.stop) {
        let page:Awaited<ReturnType<typeof getTelegramPage>> | undefined;
        for (let attempt=0;attempt<3;attempt++) {
          try { page=await getTelegramPage(checkpoint.before,true,'',checkpoint.query);break; }
          catch { if (attempt===2) throw new Error('频道连接连续失败，已保留进度；检查代理后点击继续同步。');
            await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1))); if(value.stop) break; }
        }
        if (!page) break;
        if (page.before && checkpoint.before && Number(page.before)>=Number(checkpoint.before)) throw new Error('频道翻页没有前进，已保留进度，请稍后继续同步。');
        const previous={...checkpoint};
        const previousComplete=value.data.complete;
        merge(value,page.posts);
        checkpoint.before=page.before || '';
        checkpoint.done=!page.before;
        value.data.pages++;
        value.data.complete=value.data.checkpoints.every(c=>c.done);
        try { await save(value); }
        catch { Object.assign(checkpoint,previous);value.data.pages--;value.data.complete=previousComplete;throw new Error('同步目录保存失败，请检查磁盘空间和数据目录权限后继续。'); }
        if (!value.stop && !checkpoint.done) await new Promise(resolve=>setTimeout(resolve,350));
      }
      if(value.stop) break;
    }
  } catch (error) { value.error=error instanceof Error ? error.message : '同步失败，进度已保留'; }
  finally { value.running=false; }
}
export async function startTelegramSync() {
  const value=await state();
  if (!value.running) {
    if(value.data.complete) { value.data.checkpoints=freshCheckpoints();value.data.complete=false;value.data.pages=0; }
    value.stop=false;value.error='';value.running=true;
    void sync(value);
  }
  return status(value);
}
export async function stopTelegramSync() { const value=await state();value.stop=true;return status(value); }

export async function queryTelegramCatalog(query='',category='全部',page=1,remoteBefore='',remote=true):Promise<TelegramCatalogResult> {
  const value=await state();
  let next:string|null=null;
  let remoteError='';
  if(query && remote) {
    try {
      const result=await getTelegramPage(remoteBefore,false,'',query);
      merge(value,result.posts);next=result.before;
      await save(value);
    } catch { remoteError='全频道在线搜索暂时失败，当前展示本地已同步的匹配项，请重试在线搜索。'; }
  }
  const groups=buildDramas(value.data.posts);
  const filtered=filterDramas(groups,query,category,value.data.posts);
  const size=12;
  const pageCount=Math.max(1,Math.ceil(filtered.length/size));
  page=Math.min(page,pageCount);
  return { groups:filtered.slice((page-1)*size,page*size),total:filtered.length,page,pageCount,
    categories:AI_CATEGORIES.map(name=>({name,count:name==='全部'?groups.length:groups.filter(g=>g.categories.includes(name)).length})),
    sync:status(value),remoteBefore:next,remoteError };
}
