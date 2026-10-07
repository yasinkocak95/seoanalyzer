import { getLocale } from '@/lib/locale';
import { translator } from '@seo/shared/i18n';
import { ContactForm } from './contact-form';
export async function LegalPage({ kind }: { kind: 'about' | 'privacy' | 'terms' | 'contact' }) {
  const t = translator(await getLocale());
  return <main className="container py-12"><article className="mx-auto max-w-3xl"><p className="text-sm font-bold text-action">SEO Analyzer</p><h1 className="mt-2 text-3xl font-black text-brand">{t(`legal.${kind}`)}</h1><p className="mt-4 leading-relaxed text-muted">{t(`legal.${kind}Intro`)}</p>{kind === 'contact' ? <ContactForm /> : <div className="card mt-8 space-y-6 p-6 md:p-8">{[1, 2, 3].map(i => <section key={i}><h2 className="text-lg font-bold text-brand">{t(`legal.${kind}Heading${i}`)}</h2><p className="mt-2 leading-relaxed text-muted">{t(`legal.${kind}Body${i}`)}</p></section>)}</div>}</article></main>;
}
