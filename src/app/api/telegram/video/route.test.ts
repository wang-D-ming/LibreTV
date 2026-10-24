import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ authenticated:true }));
vi.mock('@/lib/api-guard', () => ({ guardRequest: () => state.authenticated ? null : new Response(null,{status:401}), jsonError:(error:string,status:number) => Response.json({error},{status}) }));
vi.mock('@/lib/telegram-server', () => ({ getTelegramMedia:vi.fn(), telegramFetch:vi.fn() }));
import { getTelegramMedia, telegramFetch } from '@/lib/telegram-server';
import { GET } from './route';
const media = vi.mocked(getTelegramMedia);
const upstream = vi.mocked(telegramFetch);
function request(id='123',range?:string) { return new Request(`http://localhost/api/telegram/video?id=${id}`,{headers:range?{range}:{}}); }
beforeEach(()=>{ vi.resetAllMocks(); state.authenticated=true; media.mockResolvedValue('https://cdn5.telesco.pe/file/a.mp4'); });
describe('Telegram video proxy',()=>{
  it('requires authentication and validates ids before upstream access',async()=>{
    state.authenticated=false; expect((await GET(request())).status).toBe(401);
    state.authenticated=true; expect((await GET(request('../x'))).status).toBe(400);
    expect((await GET(request('123','bytes=0-1,4-5'))).status).toBe(400);
    expect(media).not.toHaveBeenCalled();
  });
  it('preserves range response headers for seeking',async()=>{
    upstream.mockResolvedValue(new Response('data',{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-3/100','content-length':'4','accept-ranges':'bytes'}}) as never);
    const res=await GET(request('123','bytes=0-3'));
    expect(res.status).toBe(206);expect(res.headers.get('content-range')).toBe('bytes 0-3/100');expect(await res.text()).toBe('data');
    expect(upstream.mock.calls[0][1]).toBe('bytes=0-3');
  });
  it('refreshes expired public links once',async()=>{
    upstream.mockResolvedValueOnce(new Response(null,{status:403}) as never).mockResolvedValueOnce(new Response('video',{headers:{'content-type':'video/mp4'}}) as never);
    expect((await GET(request())).status).toBe(200); expect(media).toHaveBeenLastCalledWith('123',true);
  });
  it('reports missing public previews without claiming they play',async()=>{
    media.mockResolvedValue(undefined);expect((await GET(request())).status).toBe(404);expect(upstream).not.toHaveBeenCalled();
  });
});
