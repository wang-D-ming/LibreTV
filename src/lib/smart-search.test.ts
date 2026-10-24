import { describe, expect, it } from 'vitest';
import { planSmartSearch, rankSmartResults } from './smart-search';
import { parseSearchList } from './cms-parser';

const source = { key: 'test', name: '测试', url: 'https://example.com/api' };
const items = parseSearchList({ list: [
  { vod_id: 1, vod_name: '再见昨日', type_name: '短剧', vod_content: '<p>女主重活一世，向仇人报仇。</p>' },
  { vod_id: 2, vod_name: '开心时光', type_name: '喜剧片', vod_actor: '周星驰', vod_year: '1999' },
  { vod_id: 3, vod_name: '夜半', type_name: '恐怖片', vod_content: '惊悚故事' },
  { vod_id: 5, vod_name: '搞笑电影解说', type_name: '电影解说' },
  { vod_id: 6, vod_name: '喜剧之王', type_name: '国产剧', vod_content: '电影的故事' },
  { vod_id: 4, vod_name: '无关片名', type_name: '剧情片' },
] }, source);
describe('smart search', () => {
  it('matches synopsis synonyms without title overlap', () => {
    const result = rankSmartResults(items, planSmartSearch('重生复仇的短剧'));
    expect(result.map(i => i.vodId)).toEqual(['1']);
    expect(result[0].matchReasons).toContain('简介：重生');
    expect(result[0].description).not.toContain('<p>');
  });
  it('combines actor, genre and year', () => {
    expect(rankSmartResults(items, planSmartSearch('1999年周星驰主演的搞笑电影')).map(i => i.vodId)).toEqual(['2']);
    expect(rankSmartResults(items, planSmartSearch('2000年周星驰主演的搞笑电影'))).toEqual([]);
  });
  it('excludes a genre without excluding every film', () => {
    expect(rankSmartResults(items, planSmartSearch('电影，不要恐怖电影')).map(i => i.vodId)).toEqual(['2', '4']);
  });
  it('preserves exact titles and rejects unrelated results', () => {
    expect(rankSmartResults(items, planSmartSearch('再见昨日')).map(i => i.vodId)).toEqual(['1']);
    expect(rankSmartResults(items, planSmartSearch('太空科幻电影'))).toEqual([]);
  });
});
