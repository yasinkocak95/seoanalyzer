import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({pages:vi.fn(),images:vi.fn(),update:vi.fn()}));
vi.mock('@seo/db',()=>({db:{finding:{deleteMany:vi.fn(),create:vi.fn(),findMany:vi.fn(async()=>[])},page:{findMany:m.pages,groupBy:vi.fn(async()=>[]),count:vi.fn(async()=>0)},crawlUrl:{findMany:vi.fn(async()=>[])},crawl:{update:m.update,findUniqueOrThrow:vi.fn(async()=>({rootUrl:'https://example.test/'}))}}}));
vi.mock('./image-check.js',()=>({imageChecksEnabled:false,findBrokenImages:m.images}));
import {analyzeStoredPages} from './analysis.js';
beforeEach(()=>{vi.clearAllMocks();m.pages.mockResolvedValue([])});
it('does not fetch or scan image lists when image checks are disabled',async()=>{
  vi.stubEnv('MAX_IMAGE_CHECKS','0');
  try{await analyzeStoredPages('crawl',true,'https://example.test/robots.txt',false,false);
    expect(m.images).not.toHaveBeenCalled();
    expect(m.pages.mock.calls.some(([query])=>query.select?.images)).toBe(false);
    const summary=m.update.mock.calls.find(([query])=>query.data.checkedRules)?.[0];
    expect(summary.data.checkedRules.some((rule:any)=>rule.code==='BROKEN_IMAGE')).toBe(false);
  }finally{vi.unstubAllEnvs()}
});
