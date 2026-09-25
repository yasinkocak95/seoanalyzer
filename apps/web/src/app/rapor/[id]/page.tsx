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
  const { id } = await params;
  const crawl = await db.crawl.findUnique({
    where: { id },
    include: { findings: true, pages: { orderBy: { url: "asc" }, take: 200 } },
  });
  if (!crawl) notFound();
  if (!["COMPLETED", "PARTIAL"].includes(crawl.status))
    redirect(`/tarama/${id}`);
  const templates = await getTemplates(id);
  const groups = attachTemplates(groupFindings(crawl.findings), templates),
    counts = countBySeverity(groups),
    passed = passedRules(crawl.checkedRules, groups);
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
          <p className="text-sm font-bold text-action">SEO ANALİZ RAPORU</p>
          <h1 className="mt-2 text-3xl font-black text-brand">Site özeti</h1>
          <p className="mt-2 break-all text-sm text-muted">
            {crawl.rootUrl} ·{" "}
            {new Intl.DateTimeFormat("tr-TR", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Europe/Istanbul",
            }).format(crawl.completedAt ?? crawl.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn"
            href={`/api/crawls/${id}/export/pdf?token=${token}`}
          >
            <Download size={17} />
            PDF indir
          </a>
          <a
            className="btn"
            href={`/api/crawls/${id}/export/word?token=${token}`}
          >
            <Download size={17} />
            Word indir
          </a>
          <a
            className="btn"
            href={`/api/crawls/${id}/export/csv?token=${token}`}
          >
            <Download size={17} />
            CSV indir
          </a>
          <RescanButton url={crawl.rootUrl} full={crawl.fullCrawl} />
          {previous && (
            <Link
              className="btn"
              href={`/karsilastir/${id}?onceki=${previous.id}`}
            >
              <GitCompareArrows size={17} />
              Karşılaştır
            </Link>
          )}
        </div>
      </div>
      {crawl.status === "PARTIAL" && (
        <div className="warning mb-7 rounded-xl p-5">
          <b className="flex items-center gap-2">
            <RefreshCcw size={18} />
            Kısmi tarama
          </b>
          <p className="mt-1 text-sm">
            {crawl.partialReason} Bekleyen URL’ler tarama durumundan
            sürdürülebilir.
          </p>
        </div>
      )}
      {crawl.skippedUrls > 0 && (
        <div className="info mb-7 flex flex-wrap items-center gap-4 rounded-xl p-5">
          <Layers size={22} />
          <div className="flex-1">
            <b>Örneklemeli tarama</b>
            <p className="mt-1 text-sm">
              Tekrar eden URL şablonlarında her şablondan birkaç örnek analiz
              edildi.{" "}
              <b>
                {crawl.skippedUrls.toLocaleString("tr-TR")} URL keşfedildi,
                analiz edilmedi.
              </b>{" "}
              Bulgular ve puan örneklere dayanır. Her URL’yi analiz etmek için
              tam tarama yapın.
            </p>
          </div>
          <RescanButton url={crawl.rootUrl} full label="Tam tarama yap" />
        </div>
      )}
      <ScoreCard score={crawl.score} previous={previous?.score ?? null} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <S i={FileText} l="İşlenen URL" n={crawl.processedPages} />
        <S i={FileText} l="Analiz edilen HTML" n={crawl.analyzedHtmlPages} />
        <S i={RefreshCcw} l="Yönlendirme" n={crawl.redirectCount} />
        <S i={FileText} l="Bekleyen URL" n={crawl.pendingUrls} />
        <S i={AlertCircle} l="Kritik bulgu" n={counts.critical} x="critical" />
        <S
          i={TriangleAlert}
          l="İyileştirilmeli"
          n={counts.warning}
          x="warning"
        />
        <S i={CheckCircle2} l="Bilgilendirme" n={counts.info} />
        <S i={AlertCircle} l="Hatalı URL" n={crawl.errorUrls} x="critical" />
        {crawl.skippedUrls > 0 && (
          <S
            i={Layers}
            l="Keşfedildi, analiz edilmedi"
            n={crawl.skippedUrls}
          />
        )}
      </div>
      <h2 className="text-2xl font-black text-brand">Öncelikli bulgular</h2>
      <p className="mb-5 mt-1 text-sm text-muted">
        Yalnız başarılı HTML sayfaları içerik kurallarına dahil edilir.
      </p>
      <ReportFindings findings={groups} />
      {templates.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-black text-brand">URL grupları</h2>
          <p className="mt-1 text-sm text-muted">
            Siteye özgü olarak URL yapısından tespit edilen şablonlar. Örneklerin
            sayfa yapısı birbirinden farklı çıkarsa grup örneklenmez, tamamı
            analiz edilir.
          </p>
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
                        ? "Farklı sayfa türleri – tamamı analiz edildi"
                        : t.status === "SAMPLED"
                          ? "Örneklendi"
                          : "Örnekleme tamamlanmadı"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <b className="block text-xl text-brand">
                        {t.discovered.toLocaleString("tr-TR")}
                      </b>
                      <small className="text-muted">Keşfedilen URL</small>
                    </div>
                    <div>
                      <b className="block text-xl text-brand">
                        {t.analyzed.toLocaleString("tr-TR")}
                      </b>
                      <small className="text-muted">
                        {t.status === "MIXED"
                          ? "Analiz edilen URL"
                          : "Analiz edilen örnek"}
                      </small>
                    </div>
                    <div>
                      <b className="block text-xl text-brand">
                        {t.skipped.toLocaleString("tr-TR")}
                      </b>
                      <small className="text-muted">
                        Keşfedildi, analiz edilmedi
                      </small>
                    </div>
                  </div>
                  {t.status !== "MIXED" && (
                    <div className="mt-4 text-sm">
                      <b className="text-brand">Örneklerin bulguları</b>
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
                                  · {h.urls.length}/{t.samples.length} örnekte
                                </small>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-1 text-muted">
                          Örneklerde sorun bulunmadı.
                        </p>
                      )}
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-action">
                          Analiz edilen örnek URL’ler
                        </summary>
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
          Kontrol edildi, sorun yok
        </h2>
        {passed ? (
          <>
            <p className="mt-1 text-sm text-muted">
              Bu taramada uygulanan{" "}
              {(passed.length + groups.length).toLocaleString("tr-TR")}{" "}
              kontrolden {passed.length.toLocaleString("tr-TR")} tanesi sorun
              bulmadı.
            </p>
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
            Bu tarama, kontrol listesi tutulmadan önceki bir sürümle yapıldı.
            Listeyi ve SEO puanını görmek için siteyi yeniden tarayın.
          </p>
        )}
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-black text-brand">Yönlendirmeler</h2>
        <p className="mt-1 text-sm text-muted">
          Yönlendirme tek başına hata değildir. Kaynak, durum ve hedef ayrı
          tutulur.
        </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-4">Kaynak URL</th>
                <th className="p-4">Durum</th>
                <th className="p-4">Hedef URL</th>
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
                    {p.redirectTarget ?? "Hedef belirtilmedi"}
                  </td>
                </tr>
              ))}
              {!redirects.length && (
                <tr>
                  <td className="p-5 text-muted" colSpan={3}>
                    Gösterilecek yönlendirme yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-black text-brand">İşlenen URL’ler</h2>
        <p className="mt-1 text-sm text-muted">
          Ekranda ilk 200 kayıt gösterilir; belge çıktıları tüm bulgu URL’lerini
          içerir.
        </p>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-4">URL</th>
                <th className="p-4">Tür</th>
                <th className="p-4">Durum</th>
                <th className="p-4">Title</th>
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
                        REDIRECT: "Yönlendirme",
                        NON_HTML: "HTML dışı",
                        ERROR: "Hata",
                      }[p.responseKind]
                    }
                  </td>
                  <td className="p-4">{p.statusCode ?? "Hata"}</td>
                  <td className="p-4">
                    {p.responseKind === "HTML"
                      ? p.title || "—"
                      : "İçerik analizi uygulanmadı"}
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
  previous,
}: {
  score: number | null;
  previous: number | null;
}) {
  if (score === null)
    return (
      <div className="card mb-4 p-5 text-sm text-muted">
        SEO puanı bu taramadan sonra eklendi. Puanı görmek için siteyi yeniden
        tarayın.
      </div>
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
          SEO puanı · {scoreLabel(score)}
        </b>
        <p className="text-sm text-muted">
          100 üzerinden. Bulguların önem derecesine ve etkilenen sayfa oranına
          göre hesaplanır.
        </p>
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
            önceki tarama: {previous}
          </small>
        </div>
      )}
    </div>
  );
}
function S({
  i: Icon,
  l,
  n,
  x = "info",
}: {
  i: typeof FileText;
  l: string;
  n: number;
  x?: string;
}) {
  return (
    <div className="card flex gap-4 p-5">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${x}`}>
        <Icon />
      </span>
      <div>
        <div className="text-2xl font-black text-brand">
          {n.toLocaleString("tr-TR")}
        </div>
        <small>{l}</small>
      </div>
    </div>
  );
}
