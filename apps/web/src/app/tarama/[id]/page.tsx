import { pageTitle } from '@/lib/page-title';
import { requireCrawl } from '@/lib/access';
export async function generateMetadata() { return { title: await pageTitle('crawl'), robots:{index:false,follow:false}}; }
import { getLocale } from '@/lib/locale';
import { translator, numberLocale, localizeFinding, turkish, type Locale } from '@seo/shared/i18n';
import{db}from'@seo/db';import{notFound}from'next/navigation';import{Progress}from'@/components/progress';export default async function Status({params}:{params:Promise<{id:string}>}){const locale=await getLocale(),t=translator(locale);const{id}=await params;await requireCrawl(id);const c=await db.crawl.findUnique({where:{id}});if(!c)notFound();return <main className="container py-14"><div className="mx-auto max-w-2xl"><p className="text-sm font-bold text-action">{t("m350")}</p><h1 className="mt-2 text-3xl font-black text-brand">{t("m351")}</h1><p className="mb-7 mt-2 break-all text-sm text-muted">{c.rootUrl}</p><div className="card p-8"><Progress id={id} initial={c}/></div><p className="mt-5 text-center text-sm text-muted">{t("m156")}</p></div></main>}
