import { describe, expect, it } from 'vitest';
import { allowedTelegramMedia, parseTelegramPage, validTelegramId } from './telegram-public';

describe('Telegram public preview', () => {
  it('keeps unavailable album items in place and extracts cursor, text and stable message ids', () => {
    const page = parseTelegramPage(`<a data-before="100"></a><div class="tgme_widget_message" data-post="aidjtv/100"><div class="tgme_widget_message_text">#AI短剧 #测试剧 1-2集<br>测试简介</div><a class="tgme_widget_message_video_player" href="https://t.me/aidjtv/100?single"><video src="https://cdn5.telesco.pe/file/a.mp4?token=abc&amp;x=1"></video></a><a class="tgme_widget_message_video_player" href="https://t.me/aidjtv/101?single">Media is too big</a></div>`);
    expect(page.before).toBe('100');
    expect(page.posts[0].title).toBe('测试剧');
    expect(page.posts[0].description).toContain('\n测试简介');
    expect(page.posts[0].episodes.map(e=>[e.label,e.available])).toEqual([['第 1 集',true],['第 2 集',false]]);
    expect(page.media['100']).toBe('https://cdn5.telesco.pe/file/a.mp4?token=abc&x=1');
    expect(page.media['101']).toBeUndefined();
  });
  it('does not invent episode numbering for an incomplete album', () => {
    const page = parseTelegramPage(`<div class="tgme_widget_message" data-post="aidjtv/10"><div class="tgme_widget_message_text">#短剧 #剧名 11-20集</div><a class="tgme_widget_message_video_player" href="https://t.me/aidjtv/10?single"><video src="https://cdn5.telesco.pe/file/a.mp4"></video></a></div>`);
    expect(page.posts[0].episodes[0].label).toBe('片段 1');
  });
  it('rejects arbitrary media targets and malformed identifiers', () => {
    for (const url of ['http://cdn5.telesco.pe/file/a','https://cdn5.telesco.pe.evil.com/file/a','https://127.0.0.1/file/a','https://user:pass@cdn5.telesco.pe/file/a','https://cdn5.telesco.pe:8443/file/a']) expect(allowedTelegramMedia(url)).toBe(false);
    for (const id of ['../123','0','123&url=x','1.1','99999999999']) expect(validTelegramId(id)).toBe(false);
  });
});
