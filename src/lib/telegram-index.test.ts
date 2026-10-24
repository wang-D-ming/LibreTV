import { beforeEach, describe, expect, it, vi } from 'vitest';
const memory=vi.hoisted(()=>({file:'',temporary:'',fail:false}));
vi.mock('node:fs/promises',()=>({
  mkdir:vi.fn(async()=>{}),
  readFile:vi.fn(async()=>{if(!memory.file)throw Object.assign(new Error('missing'),{code:'ENOENT'});return memory.file;}),
  writeFile:vi.fn(async(_path:string,data:string)=>{if(memory.fail)throw new Error('disk full');memory.temporary=data;}),
  rename:vi.fn(async()=>{memory.file=memory.temporary;}),
}));
vi.mock('./telegram-server',()=>({getTelegramPage:vi.fn()}));
import { getTelegramPage } from './telegram-server';
import { getTelegramSyncStatus, queryTelegramCatalog, startTelegramSync, stopTelegramSync } from './telegram-index';
const fetchPage=vi.mocked(getTelegramPage);
const post={id:'100',title:'历史AI剧',description:'重生复仇',tags:['AI短剧'],episodes:[{id:'100',label:'第 1 集',duration:'1:00',available:true}]};
const result={posts:[post],before:null,media:{'100':'https://cdn5.telesco.pe/file/temporary-secret'},valid:true};
beforeEach(()=>{
  delete (globalThis as typeof globalThis & {libreTelegramIndex?:unknown}).libreTelegramIndex;
  memory.file='';memory.temporary='';memory.fail=false;vi.clearAllMocks();fetchPage.mockReset();
});
describe('persistent Telegram sync',()=>{
  it('walks the ordinary timeline and persists metadata without temporary media URLs',async()=>{
    fetchPage.mockResolvedValue(result);
    await startTelegramSync();
    await vi.waitFor(async()=>expect((await getTelegramSyncStatus()).running).toBe(false));
    expect((await getTelegramSyncStatus()).complete).toBe(true);
    expect(fetchPage.mock.calls.map(c=>c[3])).toEqual(['']);
    expect(memory.file).not.toContain('temporary-secret');
    delete (globalThis as typeof globalThis & {libreTelegramIndex?:unknown}).libreTelegramIndex;
    expect((await getTelegramSyncStatus()).dramas).toBe(1);
    expect((await getTelegramSyncStatus()).complete).toBe(true);
  });
  it('searches the whole upstream channel even with an empty local index',async()=>{
    fetchPage.mockResolvedValue({...result,before:'90'});
    const response=await queryTelegramCatalog('复仇');
    expect(fetchPage).toHaveBeenCalledWith('',false,'','复仇');
    expect(response.groups[0].title).toBe('历史AI剧');expect(response.remoteBefore).toBe('90');
    expect(response.sync.complete).toBe(false);
  });
  it('reports remote failure separately instead of claiming an empty whole-channel result',async()=>{
    fetchPage.mockRejectedValue(new Error('network'));
    expect((await queryTelegramCatalog('复仇')).remoteError).toContain('在线搜索暂时失败');
  });
  it('pauses at a durable checkpoint and resumes after restart',async()=>{
    fetchPage.mockResolvedValueOnce({...result,before:'90'}).mockResolvedValue(result);
    await startTelegramSync();
    await vi.waitFor(()=>expect(memory.file).toContain('"before":"90"'));
    await stopTelegramSync();
    await vi.waitFor(async()=>expect((await getTelegramSyncStatus()).running).toBe(false),{timeout:2000});
    expect((await getTelegramSyncStatus()).complete).toBe(false);
    delete (globalThis as typeof globalThis & {libreTelegramIndex?:unknown}).libreTelegramIndex;
    fetchPage.mockClear();await startTelegramSync();
    await vi.waitFor(async()=>expect((await getTelegramSyncStatus()).complete).toBe(true));
    expect(fetchPage.mock.calls[0][0]).toBe('90');
  });
  it('does not mark repeated cursors or failed writes as complete',async()=>{
    fetchPage.mockResolvedValue({...result,before:'90'});await startTelegramSync();
    await vi.waitFor(async()=>expect((await getTelegramSyncStatus()).error).toContain('翻页没有前进'),{timeout:2000});
    expect((await getTelegramSyncStatus()).complete).toBe(false);
    memory.fail=true;fetchPage.mockResolvedValue(result);await startTelegramSync();
    await vi.waitFor(async()=>expect((await getTelegramSyncStatus()).running).toBe(false));
    expect((await getTelegramSyncStatus()).error).toContain('保存失败');
    expect((await getTelegramSyncStatus()).complete).toBe(false);
  });
});
