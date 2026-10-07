import { describe,it,expect,vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../components/language';
import { translator, tr, type Locale } from '@seo/shared/i18n';
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
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(locale==='en'?'Start analysis':'Analizi Başlat');
    expect(html).toContain(locale==='en'?'Website URL':'Site adresi');
    expect(html).not.toMatch(/undefined|\[object Object\]|>m\d+</);
    if(locale==='en')expect(html).not.toMatch(/Sitenizin|Yeni analiz|Türkçe|Tam tarama/);
    const metadata=await generateMetadata();
    expect(metadata.alternates.canonical).toMatch(locale==='en'?/\/en\/$/:/\.tr\/$/);
    expect(metadata.alternates.languages).toHaveProperty('x-default');
  });
  it('renders English finding labels and guidance',()=>{
    const t=translator('en'),f={code:'TITLE_MISSING',severity:'WARNING' as const,title:t(tr.m241),description:t(tr.m242),recommendation:t(tr.m243),affectedUrls:['https://example.test'],evidence:[{url:'https://example.test',deger:null}]};
    const html=renderToStaticMarkup(React.createElement(LanguageProvider,{locale:'en',children:React.createElement(ReportFindings,{findings:groupFindings([f])})}));
    expect(html).toContain('Missing or empty meta title');expect(html).toContain('How to fix');expect(html).toContain('Warning');
  });
});
