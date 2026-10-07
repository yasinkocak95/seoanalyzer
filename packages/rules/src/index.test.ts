import type {PageInput} from './types.js';
import { describe, expect, it } from 'vitest';
import { RULE_CATALOG, runRules, scoreFindings } from './index.js';
describe('SEO puanı', () => {
  const f = (code: string, severity: 'CRITICAL' | 'WARNING' | 'INFO', urls: string[]) => ({ code, severity, affectedUrls: urls });
  it('bulgu yoksa 100 verir, ağır bulgular puanı sıfırın altına düşürmez', () => {
    expect(scoreFindings([], 10)).toBe(100);
    expect(scoreFindings(Array.from({ length: 20 }, (_, i) => f(`K${i}`, 'CRITICAL', ['a'])), 1)).toBe(0);
  });
  it('aynı kuralın parçalı kayıtlarını tek kural sayar', () => {
    expect(scoreFindings([f('DUPLICATE_TITLE', 'WARNING', ['a', 'b']), f('DUPLICATE_TITLE', 'WARNING', ['c', 'd'])], 4)).toBe(scoreFindings([f('DUPLICATE_TITLE', 'WARNING', ['a', 'b', 'c', 'd'])], 4));
  });
  it('etkilenen sayfa oranı ve önem arttıkça puan düşer', () => {
    const few = scoreFindings([f('X', 'WARNING', ['a'])], 100), many = scoreFindings([f('X', 'WARNING', Array.from({ length: 100 }, (_, i) => `u${i}`))], 100);
    expect(few).toBeGreaterThan(many);
    expect(scoreFindings([f('X', 'INFO', ['a'])], 1)).toBeGreaterThan(scoreFindings([f('X', 'CRITICAL', ['a'])], 1));
  });
  it('kural kataloğunda her kod bir kez bulunur', () => {
    const codes = RULE_CATALOG.map(r => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(['DUPLICATE_TITLE', 'BROKEN_IMAGE', 'POSSIBLE_ORPHAN']));
  });
});
const context = (pages: Parameters<typeof runRules>[0]['pages']) => ({ pages, sitemapUrls: [], robotsAccessible: true, robotsUrl: '', crawlLimited: false });
describe('SEO kuralları', () => {
  it('temel başarılı HTML sorunlarını kanıtlar', () => { const findings = runRules(context([{ url: 'https://x.test/', statusCode: 200, title: '', description: '', h1: [], images: [{ src: '/x.jpg', alt: null, decorative: false }] }])); expect(findings.map(item => item.code)).toEqual(expect.arrayContaining(['TITLE_MISSING', 'H1_MISSING', 'IMAGE_ALT'])); });
  it('çoklu H1 kritik değildir', () => { const finding = runRules(context([{ url: 'https://x.test/', statusCode: 200, title: 'x', description: 'x', canonical: 'https://x.test/', h1: ['a', 'b'] }])).find(item => item.code === 'MULTIPLE_H1'); expect(finding?.severity).toBe('INFO'); });
  it('32 yönlendirme gövdesini tekrarlanan title bulgusuna katmaz', () => {
    const redirects = Array.from({ length: 32 }, (_, index) => ({ url: `https://sky.test/eski-${index}`, statusCode: 302, title: 'Giriş Yap', description: 'Giriş', h1: ['Giriş'] }));
    const findings = runRules(context([{ url: 'https://sky.test/giris', statusCode: 200, title: 'Giriş Yap', description: 'Giriş', h1: ['Giriş'] }, ...redirects]));
    expect(findings.find(item => item.code === 'DUPLICATE_TITLE')).toBeUndefined();
  });
});
describe('ek SEO kuralları', () => {
  const base = { url: 'https://x.test/', statusCode: 200, responseKind: 'HTML' as const, title: 'Uygun uzunlukta açıklayıcı bir sayfa başlığı', description: 'Bu açıklama, arama sonuçlarında sayfayı özetlemeye yetecek kadar uzun ve anlaşılır bir metindir.', h1: ['a'], canonical: 'https://x.test/', lang: 'tr', viewport: 'width=device-width', socialTags: { ogTitle: 'a', ogDescription: 'b', ogImage: 'c', twitterCard: 'summary' }, mixedContent: [], textContent: 'kelime '.repeat(250) };
  const codes = (page: Record<string, unknown>, extra = {}) => runRules({ ...context([{ ...base, ...page }]), ...extra }).map(f => f.code);
  it('sorunsuz sayfada yeni kurallar sessiz kalır', () => { expect(codes({}, { sitemapFound: true, brokenImages: {} })).toEqual([]); });
  it('title ve açıklama uzunluklarını karakter bazında ölçer', () => {
    expect(codes({ title: 'Kısa' })).toContain('TITLE_TOO_SHORT');
    expect(codes({ title: 'ş'.repeat(61) })).toContain('TITLE_TOO_LONG');
    expect(codes({ title: 'ş'.repeat(60) })).not.toContain('TITLE_TOO_LONG');
    expect(codes({ description: 'Kısa açıklama' })).toContain('DESCRIPTION_TOO_SHORT');
    expect(codes({ description: 'a'.repeat(161) })).toContain('DESCRIPTION_TOO_LONG');
    expect(codes({ title: '' })).not.toContain('TITLE_TOO_SHORT');
  });
  it('zayıf içeriği kelime sayısıyla bulur, metni olmayan eski kayıtları atlar', () => {
    expect(codes({ textContent: 'az kelime' })).toContain('THIN_CONTENT');
    expect(codes({ textContent: null })).not.toContain('THIN_CONTENT');
  });
  it('yalnızca HTTPS sayfalarda karışık içerik bildirir', () => {
    expect(codes({ mixedContent: ['http://cdn.test/a.js'] })).toContain('MIXED_CONTENT');
    expect(codes({ url: 'http://x.test/', mixedContent: ['http://cdn.test/a.js'] })).not.toContain('MIXED_CONTENT');
  });
  it('lang, viewport ve sosyal etiket eksiklerini bulur; toplanmamış alanları atlar', () => {
    expect(codes({ lang: '', viewport: '' })).toEqual(expect.arrayContaining(['LANG_MISSING', 'VIEWPORT_MISSING']));
    expect(codes({ lang: undefined, viewport: undefined, socialTags: undefined })).toEqual([]);
    const og = runRules(context([{ ...base, socialTags: { ogTitle: 'a', twitterCard: '' } }]));
    expect(og.find(f => f.code === 'OPEN_GRAPH_MISSING')?.evidence[0].eksikEtiketler).toEqual(['og:description', 'og:image']);
    expect(og.map(f => f.code)).toContain('TWITTER_CARD_MISSING');
  });
  it('HTML olmayan dosyalarda sayfa etiketi aramaz', () => {
    expect(codes({ responseKind: 'NON_HTML', title: '', description: '', lang: '', viewport: '', textContent: '' })).toEqual([]);
  });
  it('sitemap yokluğunu ve kırık görselleri bildirir', () => {
    expect(codes({}, { sitemapFound: false })).toContain('SITEMAP_MISSING');
    const f = runRules({ ...context([{ ...base, images: [{ src: 'https://x.test/a.png', alt: 'a', decorative: false }, { src: 'https://x.test/b.png', alt: 'b', decorative: false }] }]), brokenImages: { 'https://x.test/a.png': 404 } }).find(x => x.code === 'BROKEN_IMAGE');
    expect(f?.evidence).toEqual([{ url: 'https://x.test/', gorsel: 'https://x.test/a.png', durum: 404 }]);
  });
});

describe('cross-page regressions',()=>{
  const context=(pages:PageInput[])=>({pages,sitemapUrls:[],robotsAccessible:true,robotsUrl:'https://example.test/robots.txt',crawlLimited:false});
  it('does not flag hreflang targets outside the crawled graph',()=>{
    const findings=runRules(context([{url:'https://example.test/',statusCode:200,title:'Home',canonical:'https://example.test/',hreflangs:[{lang:'en',url:'https://other.test/'}]}]));
    expect(findings.some(f=>f.code==='HREFLANG_RETURN_MISSING')).toBe(false);
  });
  it('flags a missing return only on an inspected successful HTML target',()=>{
    const pages=[{url:'https://example.test/tr',statusCode:200,hreflangs:[{lang:'en',url:'https://example.test/en'}]},{url:'https://example.test/en',statusCode:200,hreflangs:[]}];
    expect(runRules(context(pages)).find(f=>f.code==='HREFLANG_RETURN_MISSING')?.affectedUrls).toEqual(['https://example.test/tr']);
    pages[1].hreflangs=[{lang:'tr',url:pages[0].url}];
    expect(runRules(context(pages)).some(f=>f.code==='HREFLANG_RETURN_MISSING')).toBe(false);
  });
  it('applies content checks to successful 2xx HTML and excludes non-HTML duplicates',()=>{
    const pages:PageInput[]=[{url:'https://example.test/a',statusCode:201,title:'',canonical:'https://example.test/a'},{url:'https://example.test/file',statusCode:200,responseKind:'NON_HTML',title:'same'},{url:'https://example.test/b',statusCode:200,title:'same'}];
    const findings=runRules(context(pages));
    expect(findings.find(f=>f.code==='TITLE_MISSING')?.affectedUrls).toEqual([pages[0].url]);
    expect(findings.some(f=>f.code==='DUPLICATE_TITLE')).toBe(false);
  });
  it('keeps canonical checks consistent for successful 2xx targets',()=>{
    const findings=runRules(context([{url:'https://example.test/a',statusCode:200,canonical:'https://example.test/b'},{url:'https://example.test/b',statusCode:201,canonical:'https://example.test/b'}]));
    expect(findings.some(f=>f.code==='CANONICAL_UNREACHABLE')).toBe(false);
  });
});
