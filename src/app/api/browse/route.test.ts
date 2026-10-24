import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const state = vi.hoisted(() => ({ authenticated: true, allowed: true }));
vi.mock('@/lib/api-guard', () => ({ guardRequest: () => state.authenticated ? null : new Response('{}', { status: 401 }) }));
vi.mock('@/lib/ssrf', () => ({ checkUpstreamAllowed: vi.fn(async () => ({ ok: state.allowed, reason: '内网地址不可用' })) }));
vi.mock('@/lib/fetch-utils', () => ({ fetchUpstream: vi.fn(), getCache: () => undefined, setCache: vi.fn() }));
import { fetchUpstream } from '@/lib/fetch-utils';
const upstream = vi.mocked(fetchUpstream);
const source = { key: 'demo', name: '测试源', url: 'https://example.com/api?token=demo' };
const classes = { class: [{ type_id: 58, type_name: '短剧' }, { type_id: 74, type_name: 'AI漫剧' }, { type_id: 99, type_name: '理论片' }] };
function request(body: unknown) { return new Request('http://localhost/api/browse', { method: 'POST', body: JSON.stringify(body) }); }
beforeEach(() => { state.authenticated = true; state.allowed = true; upstream.mockReset(); });

describe('POST /api/browse', () => {
  it('requires login before accessing an upstream', async () => {
    state.authenticated = false;
    expect((await POST(request({ source }))).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects bad sources, malformed category IDs and page numbers', async () => {
    for (const body of [null, { source: {} }, { source, category: '../x' }, { source, page: -1 }, { source, page: 1.5 }]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it('blocks disallowed upstream addresses', async () => {
    state.allowed = false;
    expect((await POST(request({ source }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('validates category IDs against that source before loading videos', async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify(classes)));
    expect((await POST(request({ source, category: '99' }))).status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('uses actual category ID and page, preserves base query params and filters unsafe results', async () => {
    upstream.mockResolvedValueOnce(new Response(JSON.stringify(classes)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pagecount: '10', total: '200', list: [
        { vod_id: 1, vod_name: '示例漫剧', type_id: 74, type_name: 'AI漫剧' },
        { vod_id: 2, vod_name: '应隐藏', type_id: 99, type_name: '理论片' },
        { vod_id: 3, vod_name: '不属于请求分类', type_id: 58, type_name: '短剧' },
      ] })));
    const response = await POST(request({ source, category: '74', page: 2 }));
    const data = await response.json();
    expect(data.list).toHaveLength(1);
    expect(data.page).toBe(2);
    expect(data.pageCount).toBe(10);
    const url = new URL(String(upstream.mock.calls[1][0]));
    expect(url.searchParams.get('t')).toBe('74');
    expect(url.searchParams.get('pg')).toBe('2');
    expect(url.searchParams.get('token')).toBe('demo');
  });
  it('returns an actionable error when the upstream fails', async () => {
    upstream.mockRejectedValue(new Error('上游超时'));
    const response = await POST(request({ source }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe('上游超时');
  });
});
