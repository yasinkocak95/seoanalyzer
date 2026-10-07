import Link from 'next/link';
import {
  ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp,
  FileSearch, FileText, GitCompareArrows, Globe2, Image, Info, Link2,
  ListChecks, SearchCheck, ShieldCheck, SlidersHorizontal, Sparkles,
} from 'lucide-react';
import { StartForm } from '@/components/start-form';
import { LanguageSwitcher } from '@/components/language';
import { BrandLogo } from '@/components/brand-logo';
import type { Locale } from '@seo/shared/i18n';
import { translator } from '@seo/shared/i18n';
import trCopy from './copy.json';
import enCopy from './copy.en.json';
import styles from './homepage.module.css';

const featureIcons = [Globe2, ListChecks, GitCompareArrows, FileText];
const analysisIcons = [SlidersHorizontal, FileSearch, Link2, Image, Globe2, FileText];
const anchors = ['ozellikler', 'nasil-calisir', 'ekran-goruntuleri', 'sss'];

export function Homepage({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const copy: typeof trCopy = locale === 'en' ? enCopy : trCopy;
  const homeHref = locale === 'en' ? '/en/' : '/';
  return (
    <div className={styles.landing}>
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.navbar}`}>
          <Link href={homeHref} className={styles.logo}><BrandLogo priority /></Link>
          <nav className={styles.navLinks} aria-label={copy.brand}>
            {copy.nav.map((label, index) => <a key={label} href={`#${anchors[index]}`}>{label}</a>)}
          </nav>
          <div className={styles.navActions}>
            <Link className={styles.newAnalysis} href={homeHref}>{copy.newAnalysis}</Link>
            <Link className={styles.crawls} href="/taramalar">{copy.crawls}</Link>
            <a className={`${styles.primary} ${styles.navCta}`} href="#analiz">{copy.start}<ArrowRight size={15} /></a>
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main>
        <section className={styles.hero}>
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <div className={styles.chips}>{copy.chips.map((chip, i) => <span key={chip}>{i === 0 && <span className={styles.blueDot} />}{chip}</span>)}</div>
              <h1>{copy.heading[0]} <span>{copy.heading[1]}</span> {copy.heading[2]}</h1>
              <p className={styles.description}>{copy.description}</p>
              <div className={styles.heroActions}>
                <a className={styles.primary} href="#analiz">{copy.freeStart}<ArrowRight size={18} /></a>
                <a className={styles.secondary} href="#nasil-calisir">{copy.how}<ArrowRight size={17} /></a>
              </div>
              <ul className={styles.checks}>{copy.checks.map(check => <li key={check}><Check size={14} />{check}</li>)}</ul>
            </div>
            <div className={styles.previewWrap} id="ekran-goruntuleri">
              <DashboardPreview copy={copy} />
              <p className={styles.previewCaption}>{copy.previewNote}</p>
            </div>
            <section className={styles.formCard} id="analiz" aria-labelledby="analysis-form-title">
              <div className={styles.formHeading}>
                <span className={styles.formIcon}><SearchCheck size={25} /></span>
                <div><p className={styles.eyebrow}>{copy.formLabel}</p><h2 id="analysis-form-title">{copy.formTitle}</h2><p>{copy.formDescription}</p></div>
              </div>
              <div className={styles.form}><StartForm /></div>
            </section>
          </div>
        </section>
        <section className={`${styles.container} ${styles.features}`} id="ozellikler" aria-label={copy.nav[0]}>
          {copy.features.map((feature, index) => {
            const Icon = featureIcons[index];
            return <article className={styles.feature} key={feature.title}><span className={styles.icon}><Icon size={21} /></span><h2>{feature.title}</h2><p>{feature.description}</p></article>;
          })}
        </section>
        <section className={`${styles.container} ${styles.aiFeature}`}>
          <div><span className={styles.aiLabel}><Sparkles size={16} />{t('ai.title')} · Claude</span><h2>{t('ai.landingTitle')}</h2><p>{t('ai.landingDescription')}</p></div>
          <div className={styles.aiFeaturePriorities}>{(['Critical', 'High', 'Medium'] as const).map((priority, i) => <div key={priority}><span>0{i + 1}</span><b>{t(`ai.${priority}`)}</b><ArrowRight size={17} /></div>)}</div>
        </section>
        <section className={`${styles.container} ${styles.analysisSection}`}>
          <div>
            <p className={styles.eyebrow}>{copy.analysisLabel}</p><h2 className={styles.sectionTitle}>{copy.analysisTitle}</h2><p className={styles.sectionDescription}>{copy.analysisDescription}</p>
            <div className={styles.analysisList}>{copy.analysis.map((item, index) => {
              const Icon = analysisIcons[index];
              return <article key={item.title}><Icon size={20} /><div><h3>{item.title}</h3><p>{item.description}</p></div></article>;
            })}</div>
          </div>
          <div className={styles.reportCard}>
            <div className={styles.reportHeader}><span className={styles.eyebrow}>{copy.reportLabel}</span><span className={styles.demo}>{copy.preview}</span><h3>{copy.reportTitle}</h3><p>{copy.reportDescription}</p></div>
            <table className={styles.reportTable}><thead><tr><th scope="col">{copy.findingColumn}</th><th scope="col">{copy.priorityColumn}</th><th scope="col"><span className="sr-only">{copy.preview}</span></th></tr></thead><tbody>{copy.rows.map((row, index) => <tr key={row.title}><td><strong>{row.title}</strong><span>{copy.site}{row.url}</span></td><td><Severity critical={index === 0}>{row.severity}</Severity></td><td><ArrowRight size={15} aria-hidden="true" /></td></tr>)}</tbody></table>
            <a className={styles.reportFooter} href="#analiz">{copy.freeStart}<ArrowRight size={16} /></a>
          </div>
        </section>
        <section className={styles.stepsSection} id="nasil-calisir"><div className={styles.container}>
          <p className={styles.eyebrow}>{copy.howLabel}</p><h2 className={styles.sectionTitle}>{copy.howTitle}</h2>
          <div className={styles.steps}>{copy.steps.map((step, index) => <article key={step.title}><span className={styles.stepNumber}>0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}</div>
        </div></section>
        <section className={`${styles.container} ${styles.faqSection}`} id="sss">
          <div><span className={styles.icon}><CircleHelp size={22} /></span><p className={styles.eyebrow}>{copy.faqLabel}</p><h2 className={styles.sectionTitle}>{copy.faqTitle}</h2></div>
          <div className={styles.faqs}>{copy.faqs.map(faq => <details key={faq.q}><summary>{faq.q}<ChevronDown size={18} /></summary><p>{faq.a}</p></details>)}</div>
        </section>
        <section className={`${styles.container} ${styles.closingCta}`}>
          <div><p className={styles.eyebrow}>{copy.formLabel}</p><h2>{copy.formTitle}</h2><p>{copy.formDescription}</p></div>
          <a className={styles.primary} href="#analiz">{copy.freeStart}<ArrowRight size={18} /></a>
        </section>
        <aside className={`${styles.container} ${styles.scope}`}><Info size={20} /><div><h2>{copy.scopeTitle}</h2><p>{copy.scope}</p></div></aside>
      </main>
    </div>
  );
}

function Severity({ critical, children }: { critical: boolean; children: React.ReactNode }) {
  return <span className={`${styles.severity} ${critical ? styles.critical : styles.warning}`}><span />{children}</span>;
}

function DashboardPreview({ copy }: { copy: typeof trCopy }) {
  return <div className={styles.dashboard}>
    <div className={styles.browserBar}><div className={styles.browserDots}><span /><span /><span /></div><span><ShieldCheck size={12} />{copy.site}</span><span className={styles.demo}>{copy.demo}</span></div>
    <div className={styles.dashboardBody}>
      <div className={styles.dashboardHeading}><div><p>{copy.preview}</p><h2>{copy.overview}</h2></div><span className={styles.complete}><CheckCheck size={13} />{copy.complete}</span></div>
      <div className={styles.kpis}>{[112, 80, 32, 0].map((value, index) => <div key={copy.kpis[index]}><span>{copy.kpis[index]}</span><strong>{value}</strong><div className={`${styles.kpiLine} ${index === 3 ? styles.greenLine : ''}`} /></div>)}</div>
      <div className={styles.dashboardContent}>
        <div className={styles.dashboardFindings}><div className={styles.findingsHeading}><h3>{copy.findings}</h3><ListChecks size={16} /></div>{copy.rows.slice(0, 4).map((row, index) => <div className={styles.findingRow} key={row.title}><span className={`${styles.findingDot} ${index === 0 ? styles.redDot : ''}`} /><span>{row.title}</span><b>{row.count}</b></div>)}<a href="#ozellikler">{copy.allFindings}<ArrowRight size={13} /></a></div>
        <div className={styles.distribution}><h3>{copy.distribution}</h3><div className={styles.donut} role="img" aria-label={`${copy.html}: 80, ${copy.redirects}: 32`}><span><strong>112</strong>{copy.urls}</span></div><div className={styles.legend}><span><i />{copy.html}<b>80</b></span><span><i />{copy.redirects}<b>32</b></span></div></div>
      </div>
      <div className={styles.dashboardFooter}><div className={styles.demoButtons}><span><ArrowDownToLine size={13} />{copy.pdf}</span><span><ArrowDownToLine size={13} />{copy.word}</span></div><a href="#analiz">{copy.newAnalysis}<ArrowRight size={13} /></a></div>
    </div>
  </div>;
}
