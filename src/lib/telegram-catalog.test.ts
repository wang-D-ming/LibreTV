import { describe, expect, it } from 'vitest';
import { buildDramas, classifyAI, filterDramas, isAIShort } from './telegram-catalog';
import type { TelegramPost } from './telegram-public';
const post:TelegramPost={id:'100',title:'测试剧',description:'穿越古代获得签到系统',tags:['AI短剧','穿越短剧'],episodes:[{id:'100',label:'第 2 集',number:2,duration:'1:00',available:true}]};
describe('AI channel catalog',()=>{
  it('requires an explicit AI short drama tag',()=>{
    expect(isAIShort(post)).toBe(true);
    expect(isAIShort({...post,tags:['AI漫剧']})).toBe(true);
    expect(isAIShort({...post,tags:['短剧'],description:'讨论AI技术的都市短剧'})).toBe(false);
  });
  it('classifies from tags and synopsis with multiple categories',()=>{
    expect(classifyAI(post)).toEqual(['穿越重生','系统脑洞']);
    expect(classifyAI({...post,tags:['AI短剧'],description:'普通故事'})).toEqual(['其他 AI 短剧']);
  });
  it('groups same title across pages, deduplicates messages and sorts episodes numerically',()=>{
    const first={...post,id:'90',episodes:[{...post.episodes[0],id:'90',number:1,label:'第 1 集'}]};
    const groups=buildDramas([post,first,post,{...post,id:'80',title:'真人剧',tags:['短剧']}]);
    expect(groups).toHaveLength(1);expect(groups[0].episodes.map(e=>e.number)).toEqual([1,2]);
  });
  it('searches synopsis across the catalog and combines category and query',()=>{
    const groups=buildDramas([post,{...post,id:'200',title:'都市剧',tags:['AI短剧'],description:'总裁甜宠',episodes:[]}]);
    expect(filterDramas(groups,'签到','系统脑洞').map(g=>g.title)).toEqual(['测试剧']);
    expect(filterDramas(groups,'签到','恋爱甜宠')).toHaveLength(0);
  });
  it('matches later episode captions even when the first synopsis differs',()=>{
    const later={...post,id:'200',description:'后续剧情开启星际冒险',episodes:[]};
    const groups=buildDramas([post,later]);
    expect(filterDramas(groups,'星际','全部',[post,later])).toHaveLength(1);
  });
});
