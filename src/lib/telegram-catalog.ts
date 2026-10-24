import type { TelegramEpisode, TelegramPost } from './telegram-public';

// Search pagination can stop early on Telegram. Walk the ordinary public timeline,
// then apply the AI-only filter locally so a missing search cursor cannot lose history.
export const AI_HISTORY_SCOPES = [''];
const RULES = [
  ['穿越重生', /穿越|重生|穿书|重回|年代/],
  ['玄幻修仙', /修仙|修真|玄幻|仙侠|灵气|武道|宗门|天帝|飞升/],
  ['都市逆袭', /都市|逆袭|赘婿|神豪|首富|打脸|职场/],
  ['恋爱甜宠', /甜宠|恋爱|爱情|总裁|先婚|萌宝|闪婚|婚恋/],
  ['古装权谋', /古装|权谋|皇帝|太子|王朝|太后|朝堂|宫廷|王爷/],
  ['悬疑求生', /悬疑|求生|末世|末日|惊悚|诡异|规则怪谈|丧尸|推理/],
  ['系统脑洞', /系统|脑洞|签到|金手指|异能|觉醒/],
  ['搞笑轻松', /搞笑|喜剧|沙雕|爆笑|轻松/],
] as const;
export const AI_CATEGORIES = ['全部', ...RULES.map(([name]) => name), '其他 AI 短剧'];

export function isAIShort(post: TelegramPost) {
  return post.tags.some(tag => /^(?:AI|AIGC)(?:短剧|漫剧|动画短剧)$/i.test(tag));
}
export function classifyAI(post: TelegramPost): string[] {
  const text = `${post.title} ${post.tags.join(' ')} ${post.description}`;
  const categories = RULES.filter(([,rule]) => rule.test(text)).map(([name]) => String(name));
  return categories.length ? categories : ['其他 AI 短剧'];
}
export interface TelegramDrama {
  title: string; description: string; categories: string[];
  episodes: TelegramEpisode[]; latestId: number;
}
export function buildDramas(posts: TelegramPost[]): TelegramDrama[] {
  const groups = new Map<string, TelegramDrama>();
  for (const post of [...posts].sort((a,b) => Number(a.id)-Number(b.id))) {
    if (!isAIShort(post)) continue;
    const group = groups.get(post.title) || { title:post.title, description:post.description, categories:[], episodes:[], latestId:0 };
    group.latestId = Math.max(group.latestId, Number(post.id));
    group.categories = [...new Set([...group.categories, ...classifyAI(post)])];
    for (const episode of post.episodes) {
      const existing = group.episodes.findIndex(e => e.id === episode.id);
      if (existing < 0) group.episodes.push(episode); else group.episodes[existing] = episode;
    }
    groups.set(post.title,group);
  }
  for (const group of groups.values()) group.episodes.sort((a,b) =>
    a.number !== undefined && b.number !== undefined ? a.number-b.number || Number(a.id)-Number(b.id) : Number(a.id)-Number(b.id));
  return [...groups.values()].sort((a,b) => b.latestId-a.latestId);
}
export function filterDramas(groups: TelegramDrama[], query: string, category: string, posts: TelegramPost[] = []) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const descriptions = new Map<string, Set<string>>();
  for (const post of posts) {
    if (!isAIShort(post)) continue;
    const text = descriptions.get(post.title) || new Set<string>();
    text.add(post.description); descriptions.set(post.title,text);
  }
  return groups.filter(g => {
    if(category !== '全部' && !g.categories.includes(category)) return false;
    const text=`${g.title} ${g.description} ${g.categories.join(' ')} ${[...(descriptions.get(g.title)||[])].join(' ')}`.toLowerCase();
    return words.every(word=>text.includes(word));
  });
}

export interface TelegramSyncStatus {
  running: boolean; complete: boolean; pages: number; posts: number; dramas: number;
  episodes: number; available: number; updated: string; error: string; currentTag: string;
}
export interface TelegramCatalogResult {
  groups: TelegramDrama[]; total: number; page: number; pageCount: number;
  categories: { name:string; count:number }[];
  sync: TelegramSyncStatus; remoteBefore: string | null; remoteError: string;
}
