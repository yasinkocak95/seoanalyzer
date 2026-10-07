'use client';
import { useTranslation } from '@/components/language';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t=useTranslation();
  return <main className="container py-16"><div className="card p-8"><h1 className="text-2xl font-bold">{t('m368')}</h1><p className="my-4">{t('m369')}</p><button className="btn" onClick={reset}>{t('m370')}</button></div></main>;
}
