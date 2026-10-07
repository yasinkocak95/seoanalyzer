import { translator } from '@seo/shared/i18n';
import { getLocale } from '@/lib/locale';

export type PageTitle = 'report' | 'crawl' | 'crawls' | 'projects' | 'project' | 'compare' | 'shared' | 'about' | 'privacy' | 'terms' | 'contact';

export async function pageTitle(page: PageTitle): Promise<string> {
  return translator(await getLocale())(`metadata.${page}`);
}
