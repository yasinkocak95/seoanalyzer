import { expect, it } from 'vitest';
import { load } from 'cheerio';
import type { CheerioRoot } from 'crawlee';
import { extractPageText } from './crawl.js';
const blockTags = 'p,div,li,h1,h2,h3,h4,h5,h6,br,td,th,dt,dd,section,article,header,footer,nav,aside,blockquote,figcaption,a,button,label,option';
const legacy = ($: ReturnType<typeof load>) => $('main,article,body').first().clone().find('script,style,noscript,template').remove().end().find(blockTags).after(' ').end().text().replace(/\s+/g, ' ').trim().slice(0, 100000);
it('preserves stored text/hash inputs on block boundaries, inline elements, excluded content and malformed HTML', () => {
  const examples = [
    '<main><p>one</p><p>two</p>tail</main>',
    '<header>menu</header><main>article</main><footer>end</footer>',
    '<div>before<span>inline</span><b>bold</b><div>nested</div>after</div>',
    '<p>a<br>b<a href="/">link<span>x</span></a>c</p>',
    '<script>hide</script><p>show<style>hide</style><noscript>hide</noscript><template>hide</template></p>',
    '<p> a\n\t b&nbsp;c </p><!-- hidden -->',
    '<table><tr><td>cell<td>other</table>tail',
    '<div><p>unclosed<div>next',
    '<main>' + '<p>long content</p>'.repeat(10000) + '</main>',
    ...blockTags.split(',').map(tag => `<${tag}>one<span>inside</span></${tag}>two`),
  ];
  for (const html of examples) {
    const $ = load(html), original = $.html();
    expect(extractPageText($ as unknown as CheerioRoot)).toBe(legacy($));
    expect($.html()).toBe(original);
  }
});
