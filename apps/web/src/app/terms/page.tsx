import { pageTitle } from '@/lib/page-title';
import { LegalPage } from '@/components/legal-page';
export async function generateMetadata() { return { title: await pageTitle('terms') }; }
export default function Page() { return <LegalPage kind='terms' />; }
