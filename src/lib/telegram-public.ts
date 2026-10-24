import { load } from 'cheerio';

export interface TelegramEpisode { id: string; label: string; duration: string; available: boolean; number?: number }
export interface TelegramPost { id: string; title: string; description: string; tags: string[]; episodes: TelegramEpisode[] }
export interface TelegramPage { posts: TelegramPost[]; before: string | null }

export function validTelegramId(value: string): boolean { return /^[1-9]\d{0,9}$/.test(value); }
export function allowedTelegramMedia(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && /^cdn\d+\.telesco\.pe$/.test(u.hostname) && !u.username && !u.password && !u.port && u.pathname.startsWith('/file/');
  } catch { return false; }
}

/** Public HTML only. Keep unavailable entries in albums so missing previews never shift episode numbers. */
export function parseTelegramPage(html: string): TelegramPage & { media: Record<string, string>; valid:boolean } {
  const $ = load(html);
  const posts: TelegramPost[] = [];
  const media: Record<string, string> = {};
  $('.tgme_widget_message[data-post]').each((_, element) => {
    const message = $(element);
    const id = (message.attr('data-post') || '').split('/')[1];
    if (!validTelegramId(id || '')) return;
    const textNode = message.find('.tgme_widget_message_text').first().clone();
    textNode.find('br').replaceWith('\n');
    const text = textNode.text().trim().slice(0,6000);
    const tags = [...text.matchAll(/#([^\s#]+)/g)].map(m => m[1]);
    const range = text.match(/(\d+)\s*[-—~至]\s*(\d+)\s*集/);
    const heading = text.split('\n')[0];
    const title = tags.length ? tags[tags.length - 1] : (heading || `频道视频 ${id}`);
    const entries = message.find('a.tgme_widget_message_video_player, a.tgme_widget_message_video_wrap');
    const episodes: TelegramEpisode[] = [];
    entries.each((index, el) => {
      const entry = $(el);
      const eid = (entry.attr('href') || '').match(/^https:\/\/t\.me\/aidjtv\/(\d+)(?:\?|$)/)?.[1];
      if (!eid || !validTelegramId(eid) || episodes.some(e => e.id === eid)) return;
      const url = entry.find('video').attr('src') || '';
      const available = allowedTelegramMedia(url);
      if (available) media[eid] = url;
      episodes.push({ id: eid, label: `片段 ${index + 1}`, duration: entry.find('.message_video_duration').text(), available });
    });
    // Only infer individual episode numbers when the caption range exactly matches the album size.
    if (range && Number(range[2]) - Number(range[1]) + 1 === episodes.length) {
      episodes.forEach((episode, i) => { episode.number = Number(range[1]) + i; episode.label = `第 ${episode.number} 集`; });
    }
    if (episodes.length) posts.push({ id, title, description: text, tags: tags.slice(0,-1), episodes });
  });
  const cursor = $('a[data-before]').first().attr('data-before') || '';
  return { posts, before: validTelegramId(cursor) ? cursor : null, media,
    valid: $('.tgme_channel_info_header_title').length > 0 || $('.tgme_widget_message[data-post]').length > 0,
  };
}
