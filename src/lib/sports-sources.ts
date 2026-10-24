export interface SportsSource { name: string; url: string; custom?: boolean }
export const SPORTS_PLAYLIST = 'https://iptv-org.github.io/iptv/categories/sports.m3u';
// Candidates are unverified until tested; channel names do not guarantee event coverage.
export const SPORTS_SOURCES: SportsSource[] = [
  {
    "name": "Arena Sport 1",
    "url": "http://88.212.15.17/live/test_arenasport/playlist.m3u8"
  },
  {
    "name": "Arena Sport 2",
    "url": "http://88.212.15.17/live/test_arenasport_dva/playlist.m3u8"
  },
  {
    "name": "beIN Sports 1 (1080p)",
    "url": "http://primetv.cc.cd/beinfhd11/tracks-v1a1/mono.tbin.m3u8"
  },
  {
    "name": "beIN Sports 2 (1080p)",
    "url": "http://primetv.cc.cd/beinfhd22/index.m3u8"
  },
  {
    "name": "beIN SPORTS XTRA (1080p)",
    "url": "https://bein-xtra-bein.amagi.tv/playlist.m3u8"
  },
  {
    "name": "CBS Sports Golazo Network (720p)",
    "url": "https://dai.google.com/linear/hls/event/7f3Wv6f7QEKfQna22jHqLQ/master.m3u8"
  },
  {
    "name": "Eurosport 4K Czechia",
    "url": "http://88.212.15.17/live/esp_4k_atk/playlist.m3u8"
  },
  {
    "name": "FIFA+ French (720p)",
    "url": "https://37b4c228.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWZyX0ZJRkFQbHVzRnJlbmNoX0hMUw/playlist.m3u8"
  },
  {
    "name": "FIFA+ Italy (720p)",
    "url": "https://5d95f7d7.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWl0X0ZJRkFQbHVzSXRhbGlhbl9ITFM/playlist.m3u8"
  },
  {
    "name": "FIFA+ United States (720p)",
    "url": "https://d2w9q46ikgrcwx.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-of5cbk3sav3w5/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8"
  },
  {
    "name": "Match! Ultra (1080p)",
    "url": "http://31.148.5.241/kanal_3/index.m3u8"
  },
  {
    "name": "Sport TV1",
    "url": "http://znty.dyndns.org:5010/hls/stv1.m3u8"
  },
  {
    "name": "Sport TV2",
    "url": "http://znty.dyndns.org:5010/hls/stv2.m3u8"
  }
];
