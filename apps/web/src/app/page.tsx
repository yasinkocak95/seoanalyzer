import { getLocale } from '@/lib/locale';
import { translator } from '@seo/shared/i18n';
import { Homepage } from '@/components/homepage/homepage';
export default async function Home() {
  const locale = await getLocale();
  return <Homepage locale={locale} />;
}

export async function generateMetadata() {
 const locale=await getLocale(),t=translator(locale),base=process.env.NEXT_PUBLIC_APP_URL??'https://seo.yasinkocak.com.tr';
 return {title:t('m001'),description:t('m002'),alternates:{canonical:new URL(locale==='en'?'/en/':'/',base).toString(),languages:{tr:new URL('/',base).toString(),en:new URL('/en/',base).toString(),'x-default':new URL('/',base).toString()}}};
}
