import { isRelevant, normalizeTitle } from './cms-parser';
import type { SearchResultItem } from './types';

const TOPICS = [
  ['重生', '重生', '重活一世', '重来一世', '再活一次'],
  ['穿越', '穿越', '穿书', '穿越时空', '时空穿梭'],
  ['复仇', '复仇', '报仇', '复仇雪恨', '雪耻'],
  ['逆袭', '逆袭', '翻身', '崛起', '逆天改命'],
  ['甜宠', '甜宠', '甜甜的', '甜蜜', '宠妻', '先婚后爱'],
  ['爱情', '爱情', '恋爱', '言情', '浪漫', '恋人'],
  ['喜剧', '喜剧', '搞笑', '好笑', '幽默', '爆笑', '轻松'],
  ['悬疑', '悬疑', '推理', '破案', '侦探', '探案'],
  ['恐怖', '恐怖', '吓人', '惊悚', '恐惧'],
  ['科幻', '科幻', '科学幻想', '未来世界'],
  ['太空', '太空', '宇宙', '星际', '外星', '航天'],
  ['机器人', '机器人', '人工智能', '机械人', '智能机器'],
  ['末日', '末日', '末世', '世界末日', '灾难'],
  ['丧尸', '丧尸', '僵尸', '活死人'],
  ['修仙', '修仙', '仙侠', '修真', '飞升'],
  ['武侠', '武侠', '江湖', '侠客'],
  ['校园', '校园', '学校', '青春', '学生时代'],
  ['职场', '职场', '打工', '上班', '商战'],
  ['家庭', '家庭', '亲情', '家人'],
  ['治愈', '治愈', '温暖', '暖心', '温馨'],
  ['战争', '战争', '战场', '抗战', '军事'],
  ['犯罪', '犯罪', '警匪', '黑帮', '刑侦'],
  ['古装', '古装', '古代', '宫廷', '宫斗'],
  ['短剧', '短剧', '微短剧', '爽剧', '重生民国', '穿越年代', '现代言情', '反转爽文', '女恋总裁', '闪婚离婚', '都市脑洞', '古装仙侠', '现代都市', '言情总裁', '脑洞悬疑'],
  ['AI漫剧', 'AI漫剧', 'AI短剧', '人工智能生成的短剧'],
  ['漫剧', '漫剧', '动态漫', '动态漫画'],
  ['动漫', '动漫', '动画', '动画片', '卡通'],
  ['电影', '电影', '影片', '动作片', '喜剧片', '爱情片', '科幻片', '恐怖片', '剧情片', '战争片', '纪录片'],
  ['电视剧', '电视剧', '连续剧', '国产剧', '欧美剧', '日剧', '韩剧', '韩国剧', '日本剧', '海外剧', '香港剧'],
  ['纪录片', '纪录片', '记录片', '纪实'],
] as const;

export interface SmartPlan {
  query: string;
  topics: { name: string; aliases: string[] }[];
  excluded: string[];
  terms: string[];
  year?: string;
  retrieval: string[];
}

export function planSmartSearch(query: string): SmartPlan {
  let remaining = query.trim();
  const excluded: string[] = [];
  remaining = remaining.replace(/(?:不要|不看|排除|不想看|不喜欢)([^，,。；;\s]+)/g, (_, clause: string) => {
    const matches = TOPICS.filter(t => t.slice(1).some(a => clause.toLowerCase().includes(a.toLowerCase())));
    for (const topic of matches.filter(t => matches.length === 1 || !['电影', '电视剧'].includes(t[0]))) if (topic.slice(1).some((alias) => clause.toLowerCase().includes(alias.toLowerCase()))) excluded.push(...topic.slice(1));
    return ' ';
  });
  const topics = TOPICS.filter((topic) => topic.slice(1).some((alias) => remaining.toLowerCase().includes(alias.toLowerCase())))
    .map((topic) => ({ name: topic[0], aliases: [...topic.slice(1)] as string[] }));
  const year = remaining.match(/(?:19|20)\d{2}/)?.[0];
  if (year) remaining = remaining.replace(year, ' ');
  const matchedAliases = topics.flatMap((t) => t.aliases).sort((a, b) => b.length - a.length);
  for (const alias of matchedAliases) remaining = remaining.replace(new RegExp(alias, 'gi'), ' ');
  remaining = remaining.replace(/我想看|想看|帮我找|找一些|找一部|推荐一些|推荐一部|推荐|有没有|关于|讲述|讲的是|有关|题材|类型|内容|故事|主演|导演|执导|的|一部|一些|一段|适合|最好|比较|最好是|给我|可以|看看|看|年/g, ' ');
  const terms = [...new Set(remaining.split(/[\s，,。；;！!？?]+/).map((s) => s.trim()).filter((s) => s.length >= 2))].slice(0, 6);
  // Preserve the original title and cap expansion to avoid multiplying requests across many sources.
  const retrieval = [...new Set([query.trim(), ...terms, ...topics.map((t) => t.name), ...topics.flatMap((t) => t.aliases.slice(1, 2))])].filter(Boolean).slice(0, 4);
  return { query, topics, excluded: [...new Set(excluded)], terms, year, retrieval };
}

export function rankSmartResults(items: SearchResultItem[], plan: SmartPlan): SearchResultItem[] {
  return items.flatMap((item) => {
    if (!item.name) return [];
    const fields = [
      ['标题', item.name, 12], ['简介', item.description, 5], ['类型', item.typeName, 7],
      ['演员', item.actor, 9], ['导演', item.director, 9], ['地区', item.area, 4],
    ] as const;
    const normalizedFields = fields.map(([label, value, weight]) => ({ label, text: normalizeTitle(value || ''), weight }));
    const text = normalizedFields.map((f) => f.text).join(' ');
    if (plan.excluded.some((term) => text.includes(normalizeTitle(term)))) return [];
    if (plan.year && item.year !== plan.year) return [];
    if (plan.topics.some(t => t.name === '电影') && /解说|预告/.test(item.typeName || '')) return [];
    let score = 0;
    const reasons = new Set<string>();
    const exact = normalizeTitle(item.name) === normalizeTitle(plan.query);
    if (exact) { score += 100; reasons.add('片名完全匹配'); }
    else if (isRelevant(item.name, plan.query)) { score += 45; reasons.add('片名匹配'); }
    let missing = 0;
    for (const constraint of [...plan.topics.map((t) => ({ label: t.name, aliases: t.aliases })), ...plan.terms.map((term) => ({ label: term, aliases: [term] }))]) {
      const format = ['电影', '电视剧', '短剧', '漫剧', '动漫', 'AI漫剧', '纪录片'].includes(constraint.label);
      const candidates = format && item.typeName ? normalizedFields.filter(f => f.label === '类型') : normalizedFields;
      const hit = candidates.find((field) => constraint.aliases.some((alias) => field.text.includes(normalizeTitle(alias))));
      if (hit) { score += hit.weight; reasons.add(`${hit.label}：${constraint.label}`); }
      else missing++;
    }
    // A direct title match is still useful; natural-language requests must satisfy all stated facets.
    if (!score || (missing > 0 && !exact && !isRelevant(item.name, plan.query))) return [];
    return [{ ...item, relevanceScore: score, matchReasons: [...reasons].slice(0, 4) }];
  }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || a.name.localeCompare(b.name, 'zh-CN'));
}

// Bounded process-local corpus: browse/search results add description metadata, never playback links.
const corpus = new Map<string, Map<string, SearchResultItem>>();
export function rememberSearchItems(sourceUrl: string, items: SearchResultItem[]) {
  const key = sourceUrl.replace(/\/+$/, '');
  const bucket = corpus.get(key) || new Map<string, SearchResultItem>();
  for (const item of items) {
    const previous = bucket.get(item.vodId);
    bucket.delete(item.vodId);
    bucket.set(item.vodId, { ...previous, ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)) } as SearchResultItem);
  }
  while (bucket.size > 1000) bucket.delete(bucket.keys().next().value!);
  corpus.delete(key); corpus.set(key, bucket);
  while (corpus.size > 50) corpus.delete(corpus.keys().next().value!);
}
export function recalledSearchItems(sourceUrl: string): SearchResultItem[] {
  return [...(corpus.get(sourceUrl.replace(/\/+$/, ''))?.values() || [])];
}
