import { describe, it, expect } from 'vitest';
import { tr, en, translator, localeOf, localizeFinding, localizeEvidence } from './i18n/index.js';
describe('translation contract', () => {
  it('has complete key and interpolation parity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
    for (const key of Object.keys(tr) as (keyof typeof tr)[]) {
      expect(en[key].trim(),key).not.toBe('');
      const placeholders=(s:string)=>[...s.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort();
      expect(placeholders(en[key]),key).toEqual(placeholders(tr[key]));
    }
  });
  it('renders Turkish and English and safely falls back', () => {
    expect(translator('tr')('m012')).toContain('Sitenizin');
    expect(translator('en')('m012')).toContain("site's SEO issues");
    expect(translator('en')('untranslated Turkish text')).toBe('untranslated Turkish text');
    expect(translator('en')('m999999')).toBe('—');
    expect(translator('en')('translation.key.name')).toBe('—');
    expect(translator('en')({} as string)).toBe('—');
    expect(translator('en')('m208')).not.toContain('{0}');
    expect(translator('en')(undefined)).toBe('');
    expect(localeOf('fr')).toBe('tr');
  });
  it('translates existing persisted findings without changing technical data', () => {
    const finding={code:'TITLE_TOO_SHORT',title:tr.m269,description:'Title 30 karakterden kısa; sayfayı yeterince tanımlamıyor olabilir.',recommendation:tr.m271,affectedUrls:['https://example.com/a/?x=1'],fingerprint:'unchanged'};
    const result=localizeFinding(finding,'en');
    expect(result.title).toBe('Meta title too short');
    expect(result.description).toContain('30 characters');
    expect(result.affectedUrls).toEqual(finding.affectedUrls);
    expect(result.fingerprint).toBe(finding.fingerprint);
    expect(localizeFinding(finding,'tr')).toEqual(finding);
    expect(translator('en')('10 URL işlendi, 2 URL bekliyor, 8 URL şablon örneklemesiyle atlandı')).toBe('10 URLs processed, 2 URLs pending, 8 URLs skipped through template sampling');
  });
  it('localizes evidence labels while preserving observed values', () => {
    expect(localizeEvidence({hedef:'https://example.com/Türkçe',deger:'Başlık',canonical:'https://example.com/'},'en')).toEqual({Target:'https://example.com/Türkçe',Value:'Başlık',canonical:'https://example.com/'});
  });
});
