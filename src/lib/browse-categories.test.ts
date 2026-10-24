import { describe, expect, it } from 'vitest';
import { parseBrowseCategories, positivePage } from './browse-categories';

describe('source categories', () => {
  it('inherits short drama genres while keeping AI and regular animation distinct', () => {
    const result = parseBrowseCategories({ class: [
      { type_id: 1, type_name: '短剧大全' },
      { type_id: 2, type_pid: 1, type_name: '现代言情' },
      { type_id: 3, type_pid: 1, type_name: 'AI漫剧' },
      { type_id: 4, type_name: '国产动漫' },
      { type_id: 5, type_name: '动态漫' },
      { type_id: 6, type_name: '恐怖片' },
      { type_id: 7, type_name: '纪录片' },
    ] });
    expect(result.map((c) => c.group)).toEqual(['short', 'short', 'ai', 'animation', 'comic', 'thriller', 'documentary']);
  });
  it('excludes explicit categories and their descendants, even with a generic child name', () => {
    const result = parseBrowseCategories({ class: [
      { type_id: 1, type_name: '福利' },
      { type_id: 2, type_pid: 1, type_name: '最新作品' },
      { type_id: 3, type_name: '理论片' },
      { type_id: 4, type_name: '剧情片' },
    ] });
    expect(result.map((c) => c.id)).toEqual(['4']);
  });
  it('handles parent cycles, invalid entries and repeated IDs without hanging', () => {
    const result = parseBrowseCategories({ class: [
      null, { type_id: '<bad>', type_name: '短剧' },
      { type_id: 1, type_pid: 2, type_name: '电影片' },
      { type_id: 2, type_pid: 1, type_name: '喜剧片' },
      { type_id: 2, type_pid: 1, type_name: '动作片' },
    ] });
    expect(result).toHaveLength(2);
  });
  it('does not treat missing categories as an empty successful response', () => {
    expect(() => parseBrowseCategories({ list: [] })).toThrow('分类列表');
    expect(positivePage('8')).toBe(8);
    expect(positivePage('invalid')).toBe(1);
    expect(positivePage(Infinity)).toBe(1);
  });
});
