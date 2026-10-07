import { pageTitle } from '@/lib/page-title';
import { SharedReport } from '@/components/shared-report';
export async function generateMetadata() { return { title: await pageTitle('shared'),  robots: { index: false, follow: false }, referrer: 'no-referrer' as const }; }
export default function Page() { return <SharedReport />; }
