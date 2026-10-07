export const metadata={robots:{index:false,follow:false}};
import { getLocale } from '@/lib/locale';
import { translator, numberLocale, localizeFinding, turkish, type Locale } from '@seo/shared/i18n';
import Link from "next/link";
import { db } from "@seo/db";
import { notFound, redirect } from "next/navigation";
import { ReportFindings } from "@/components/report-findings";
import { RescanButton } from "@/components/rescan-button";
import { attachTemplates, getTemplates } from "@/lib/templates";
import { signExport } from "@/lib/report-data";
import {
  countBySeverity,
  groupFindings,
  passedRules,
  scoreLabel,
} from "@/lib/findings";
import {
  AlertCircle,
  CheckCircle2,
  CircleCheck,
  Download,
  FileText,
  GitCompareArrows,
  Layers,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Report({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const locale=await getLocale(),translate=translator(locale);
  const { id } = await params;
  const crawl = await db.crawl.findUnique({
    where: { id },
    include: { findings: true, pages: { orderBy: { url: "asc" }, take: 200 } },
  });
  if (!crawl) notFound();
  if (!["COMPLETED", "PARTIAL"].includes(crawl.status))
    redirect(`/tarama/${id}`);
  const templates = await getTemplates(id);
  const groups = attachTemplates(groupFindings(crawl.findings.map(f=>localizeFinding(f,locale))), templates),
    counts = countBySeverity(groups),
    passed = passedRules(crawl.checkedRules, groups)?.map(r=>({...r,title:translate(r.title)}));
  const previous = await db.crawl.findFirst({
      where: {
        normalizedHost: crawl.normalizedHost,
        status: "COMPLETED",
        createdAt: { lt: crawl.createdAt },
      },
      orderBy: { createdAt: "desc" },
    }),
    token = signExport(id),
    redirects = crawl.pages.filter((p) => p.responseKind === "REDIRECT");
  return (
    <main className="container py-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold text-action">{translate("m117")}</p>
          <h1 className="mt-2 text-3xl font-black text-brand">{translate("m118")}</h1>
          <p className="mt-2 break-all text-sm text-muted">
            {crawl.rootUrl} ·{" "}
            {new Intl.DateTimeFormat(numberLocale(locale), {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Europe/Istanbul",
            }).format(crawl.completedAt ?? crawl.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn"
            href={`/api/crawls/${id}/export/pdf?token=${token}&lang=${locale}`}
          >
            <Download size={17} />
             {translate("m119")} </a>
          <a
            className="btn"
            href={`/api/crawls/${id}/export/word?token=${token}&lang=${locale}`}
          >
            <Download size={17} />
             {translate("m120")} </a>
          <a
            className="btn"
            href={`/api/crawls/${id}/export/csv?token=${token}&lang=${locale}`}
          >
            <Download size={17} />
             {translate("m121")} </a>
          <RescanButton url={crawl.rootUrl} full={crawl.fullCrawl} />
          {previous && (
            <Link
              className="btn"
              href={`/karsilastir/${id}?onceki=${previous.id}`}
            >
              <GitCompareArrows size={17} />
               {translate("m122")} </Link>
          )}
        </div>
      </div>
      {crawl.status === "PARTIAL" && (
        <div className="warning mb-7 rounded-xl p-5">
          <b className="flex items-center gap-2">
            <RefreshCcw size={18} />
             {translate("m123")} </b>
          <p className="mt-1 text-sm">
            {translate(crawl.partialReason)}  {translate("m124")} </p>
        </div>
      )}
      {crawl.skippedUrls > 0 && (
        <div className="info mb-7 flex flex-wrap items-center gap-4 rounded-xl p-5">
          <Layers size={22} />
          <div className="flex-1">
            <b>{translate("m125")}</b>
            <p className="mt-1 text-sm">
               {translate("m126")}{" "}
              <b>
                {crawl.skippedUrls.toLocaleString(numberLocale(locale))}  {translate("m127")} </b>{" "}
               {translate("m128")} </p>
          </div>
          <RescanButton url={crawl.rootUrl} full label={translate("m342")} />
        </div>
      )}
      <ScoreCard locale={locale} score={crawl.score} previous={previous?.score ?? null} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <S locale={locale} i={FileText} l={translate("m062")} n={crawl.processedPages} />
        <S locale={locale} i={FileText} l={translate("m325")} n={crawl.analyzedHtmlPages} />
        <S locale={locale} i={RefreshCcw} l={translate("m024")} n={crawl.redirectCount} />
        <S locale={locale} i={FileText} l={translate("m341")} n={crawl.pendingUrls} />
        <S locale={locale} i={AlertCircle} l={translate("m340")} n={counts.critical} x="critical" />
        <S locale={locale}
          i={TriangleAlert}
          l={translate("m036")}
          n={counts.warning}
          x="warning"
        />
        <S locale={locale} i={CheckCircle2} l={translate("m339")} n={counts.info} />
        <S locale={locale} i={AlertCircle} l={translate("m063")} n={crawl.errorUrls} x="critical" />
        {crawl.skippedUrls > 0 && (
          <S locale={locale}
            i={Layers}
            l={translate("m129")}
            n={crawl.skippedUrls}
          />
        )}
      </div>
      <h2 className="text-2xl font-black text-brand">{translate("m064")}</h2>
      <p className="mb-5 mt-1 text-sm text-muted">
         {translate("m130")} </p>
      <ReportFindings findings={groups} />
      {templates.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-black text-brand">{translate("m068")}</h2>
          <p className="mt-1 text-sm text-muted">
             {translate("m131")} </p>
          <div className="mt-4 space-y-3">
            {templates.map((t) => {
              const found = groups.filter((g) =>
                g.templateHits?.some((h) => h.pattern === t.pattern),
              );
              return (
                <div className="card p-5" key={t.pattern}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <b className="break-all text-brand">{t.pattern}</b>
                    <span
                      className={`badge ${t.status === "MIXED" ? "warning" : "info"}`}
                    >
                      {t.status === "MIXED"
                        ? translate("m132")
                        : t.status === "SAMPLED"
                          ? translate("m133")
                          : translate("m134")}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <b className="block text-xl text-brand">
                        {t.discovered.toLocaleString(numberLocale(locale))}
                      </b>
                      <small className="text-muted">{translate("m135")}</small>
                    </div>
                    <div>
                      <b className="block text-xl text-brand">
                        {t.analyzed.toLocaleString(numberLocale(locale))}
                      </b>
                      <small className="text-muted">
                        {t.status === "MIXED"
                          ? translate("m343")
                          : translate("m136")}
                      </small>
                    </div>
                    <div>
                      <b className="block text-xl text-brand">
                        {t.skipped.toLocaleString(numberLocale(locale))}
                      </b>
                      <small className="text-muted">
                         {translate("m129")} </small>
                    </div>
                  </div>
                  {t.status !== "MIXED" && (
                    <div className="mt-4 text-sm">
                      <b className="text-brand">{translate("m137")}</b>
                      {found.length ? (
                        <ul className="mt-1 space-y-1">
                          {found.map((g) => {
                            const h = g.templateHits!.find(
                              (x) => x.pattern === t.pattern,
                            )!;
                            return (
                              <li key={g.code}>
                                {g.title}{" "}
                                <small className="text-muted">
                                  · {h.urls.length}/{t.samples.length}  {translate("m138")} </small>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-1 text-muted">
                           {translate("m098")} </p>
                      )}
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-action">
                           {translate("m139")} </summary>
                        {t.samples.map((u) => (
                          <div className="break-all text-action" key={u}>
                            {u}
                          </div>
                        ))}
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="mt-12">
        <h2 className="text-2xl font-black text-brand">
           {translate("m344")} </h2>
        {passed ? (
          <>
            <p className="mt-1 text-sm text-muted">{translate('passedSummary',[(passed.length+groups.length).toLocaleString(numberLocale(locale)),passed.length.toLocaleString(numberLocale(locale))])}</p>
            <div className="card mt-4 grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {passed.map((r) => (
                <div className="flex items-start gap-2 text-sm" key={r.code}>
                  <CircleCheck
                    className="mt-0.5 shrink-0 text-emerald-600"
                    size={17}
                  />
                  <span>
                    {r.title}
                    <small className="block text-muted">{r.code}</small>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="card mt-4 p-5 text-sm text-muted">
             {translate("m141")} </p>
        )}
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-black text-brand">{translate("m142")}</h2>
        <p className="mt-1 text-sm text-muted">
           {translate("m143")} </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-4">{translate("m347")}</th>
                <th className="p-4">{translate("m144")}</th>
                <th className="p-4">{translate("m348")}</th>
              </tr>
            </thead>
            <tbody>
              {redirects.map((p) => (
                <tr className="border-b" key={p.id}>
                  <td className="break-all p-4 text-action">{p.url}</td>
                  <td className="p-4">
                    <span className="badge info">{p.statusCode}</span>
                  </td>
                  <td className="break-all p-4 text-action">
                    {p.redirectTarget ?? translate("m349")}
                  </td>
                </tr>
              ))}
              {!redirects.length && (
                <tr>
                  <td className="p-5 text-muted" colSpan={3}>
                     {translate("m145")} </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-black text-brand">{translate("m146")}</h2>
        <p className="mt-1 text-sm text-muted">
           {translate("m147")} </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-4">{translate("m039")}</th>
                <th className="p-4">{translate("m148")}</th>
                <th className="p-4">{translate("m144")}</th>
                <th className="p-4">{translate("m081")}</th>
              </tr>
            </thead>
            <tbody>
              {crawl.pages.map((p) => (
                <tr className="border-b" key={p.id}>
                  <td className="max-w-sm break-all p-4 text-action">
                    {p.url}
                  </td>
                  <td className="p-4">
                    {
                      {
                        HTML: "HTML",
                        REDIRECT: translate("m024"),
                        NON_HTML: translate("m149"),
                        ERROR: translate("m150"),
                      }[p.responseKind]
                    }
                  </td>
                  <td className="p-4">{p.statusCode ?? translate("m150")}</td>
                  <td className="p-4">
                    {p.responseKind === "HTML"
                      ? p.title || "—"
                      : translate("m151")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
function ScoreCard({
  score,
  previous, locale,
}: {
  score: number | null;
  previous: number | null; locale:Locale;
}) {
  const translate=translator(locale);
  if (score === null)
    return (
      <div className="card mb-4 p-5 text-sm text-muted">
         {translate("m152")} </div>
    );
  const color =
      score >= 75
        ? "text-emerald-600"
        : score >= 50
          ? "text-amber-600"
          : "text-red-600",
    diff = previous === null ? null : score - previous;
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-6 p-6">
      <div className={`text-6xl font-black ${color}`}>{score}</div>
      <div className="flex-1">
        <b className="block text-lg text-brand">
           {translate("m153")} {scoreLabel(score,locale)}
        </b>
        <p className="text-sm text-muted">
           {translate("m154")} </p>
      </div>
      {diff !== null && (
        <div className="text-right text-sm">
          <b
            className={
              diff > 0
                ? "text-emerald-600"
                : diff < 0
                  ? "text-red-600"
                  : "text-muted"
            }
          >
            {diff > 0 ? "+" : ""}
            {diff}
          </b>
          <small className="block text-muted">
             {translate("m155")} {previous}
          </small>
        </div>
      )}
    </div>
  );
}
function S({
  i: Icon, locale,
  l,
  n,
  x = "info",
}: {
  i: typeof FileText; locale:Locale;
  l: string;
  n: number;
  x?: string;
}) {
  const translate=translator(locale);
  return (
    <div className="card flex gap-4 p-5">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${x}`}>
        <Icon />
      </span>
      <div>
        <div className="text-2xl font-black text-brand">
          {n.toLocaleString(numberLocale(locale))}
        </div>
        <small>{l}</small>
      </div>
    </div>
  );
}
