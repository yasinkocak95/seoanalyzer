import { describe,it,expect,vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../components/language';
import { translator, tr, type Locale } from '@seo/shared/i18n';
import { Homepage } from '../components/homepage/homepage';
import trCopy from '../components/homepage/copy.json';
import enCopy from '../components/homepage/copy.en.json';
import homepageStyles from '../components/homepage/homepage.module.css';
const state=vi.hoisted(()=>({locale:'tr' as 'tr'|'en'}));
vi.mock('./locale',()=>({getLocale:async()=>state.locale}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()}),usePathname:()=>state.locale==='en'?'/en/':'/'}));
import Home,{generateMetadata} from '../app/page';
import Layout from '../app/layout';
import { ReportFindings } from '../components/report-findings';
import { groupFindings } from './findings';
describe('server and client rendering',()=>{
  it.each(['tr','en'] as Locale[])('renders %s without language flash',async locale=>{
    state.locale=locale;
    const home=await Home(),html=renderToStaticMarkup(await Layout({children:home}));
    expect(home.type).toBe(Homepage);
    expect(home.props.locale).toBe(locale);
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(locale==='en'?'Start analysis':'Analizi Başlat');
    expect(html).toContain(locale==='en'?'Website URL':'Site adresi');
    expect(html).not.toMatch(/undefined|\[object Object\]|>m\d+</);
    if(locale==='en')expect(html).not.toMatch(/Sitenizin|Yeni analiz|Türkçe|Tam tarama/);
    const metadata=await generateMetadata();
    expect(metadata.alternates.canonical).toMatch(locale==='en'?/\/en\/$/:/\.tr\/$/);
    const base=process.env.NEXT_PUBLIC_APP_URL??'https://seo.yasinkocak.com.tr';
    expect(metadata.alternates).toEqual({
      canonical:new URL(locale==='en'?'/en/':'/',base).toString(),
      languages:{tr:new URL('/',base).toString(),en:new URL('/en/',base).toString(),'x-default':new URL('/',base).toString()},
    });
    const copy=locale==='en'?enCopy:trCopy;
    const escape=(text:string)=>renderToStaticMarkup(React.createElement('span',null,text)).slice(6,-7);
    for(const text of [
      ...copy.nav,...copy.chips,...copy.heading.filter(Boolean),copy.description,
      ...copy.checks,copy.formTitle,copy.formDescription,copy.formLabel,
      copy.overview,copy.complete,...copy.kpis,copy.findings,copy.allFindings,
      copy.pdf,copy.word,copy.distribution,copy.html,copy.redirects,copy.previewNote,
      copy.analysisLabel,copy.analysisTitle,copy.analysisDescription,
      copy.reportLabel,copy.reportTitle,copy.reportDescription,copy.findingColumn,copy.priorityColumn,
      copy.howLabel,copy.howTitle,copy.faqLabel,copy.faqTitle,copy.scopeTitle,copy.scope,
      ...[...copy.features,...copy.analysis,...copy.steps].flatMap(item=>[item.title,item.description]),
      ...copy.rows.flatMap(row=>[row.title,row.severity]),...copy.faqs.flatMap(faq=>[faq.q,faq.a]),
    ])expect(html).toContain(escape(text));
    for(const className of [homepageStyles.logo,homepageStyles.newAnalysis]){
      const link=Array.from(html.matchAll(/<a\b[^>]*>/g),match=>match[0]).find(tag=>tag.includes(`class="${className}"`));
      expect(link).toMatch(locale==='en'?/href="\/en\/?"/:/href="\/"/);
    }
    expect(html).toContain('href="/taramalar"');
    expect(html).toContain(`/api/language?lang=en&amp;returnTo=${locale==='en'?'%2Fen%2F':'%2F'}`);
    expect(html).toContain(`/api/language?lang=tr&amp;returnTo=%2F`);
  });
  it('uses the same homepage structure and design in both languages',async()=>{
    const render=async(locale:Locale)=>{
      state.locale=locale;
      return renderToStaticMarkup(React.createElement(LanguageProvider,{locale,children:await Home()}));
    };
    const trHtml=await render('tr'),enHtml=await render('en');
    const structure=(html:string)=>Array.from(html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g),match=>({
      tag:match[1],className:/\blang="(tr|en)"/.test(match[2])?undefined:match[2].match(/\bclass="([^"]*)"/)?.[1],id:match[2].match(/\bid="([^"]*)"/)?.[1],
    }));
    expect(structure(enHtml)).toEqual(structure(trHtml));
    expect(enHtml).not.toMatch(/Sitenizin|Yeni analiz|Tarama özeti|Örnek rapor|Kırık iç link|Kapsam notu|Başlamadan önce/);
  });
  it('renders English finding labels and guidance',()=>{
    const t=translator('en'),f={code:'TITLE_MISSING',severity:'WARNING' as const,title:t(tr.m241),description:t(tr.m242),recommendation:t(tr.m243),affectedUrls:['https://example.test'],evidence:[{url:'https://example.test',deger:null}]};
    const html=renderToStaticMarkup(React.createElement(LanguageProvider,{locale:'en',children:React.createElement(ReportFindings,{findings:groupFindings([f])})}));
    expect(html).toContain('Missing or empty meta title');expect(html).toContain('How to fix');expect(html).toContain('Warning');
  });
});
