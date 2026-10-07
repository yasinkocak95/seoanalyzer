import Image from 'next/image';

export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return <span className="brand-logo-frame">
    <Image className="brand-logo" src="/branding/seo-analyzer-logo.png" width={1200} height={378} alt="SEO Analyzer" priority={priority} sizes="(max-width: 640px) 180px, 220px" />
  </span>;
}
