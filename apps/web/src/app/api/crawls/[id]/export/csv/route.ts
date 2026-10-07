import { getLocale } from '@/lib/locale';
import { translator,turkish,localeOf,localizeFinding,localizeEvidence } from '@seo/shared/i18n';
import { NextResponse } from "next/server";
import { db } from "@seo/db";
import { groupFindings, severityLabel } from "@/lib/findings";
import { verifyExport } from "@/lib/report-data";
import { getTemplates } from "@/lib/templates";
export const runtime = "nodejs";

// Türkçe Excel ";" ayırıcı bekler. "=", "+", "-", "@" ile başlayan hücreler formül
// olarak çalışmasın diye başına tek tırnak eklenir.
const cell = (value: unknown) => {
  let s = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
const details = (e: Record<string, unknown>, hide: string[]) =>
  Object.entries(e)
    .filter(([k]) => k !== "url" && !hide.includes(k))
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("; ");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const locale=localeOf(new URL(request.url).searchParams.get('lang')??await getLocale()),t=translator(locale);
  const { id } = await params,
    token = new URL(request.url).searchParams.get("token");
  if (!verifyExport(id, token))
    return NextResponse.json({ error: t("m161") }, { status: 403 });
  const crawl = await db.crawl.findUnique({
    where: { id },
    include: { findings: true },
  });
  if (!crawl) return NextResponse.json({ error: t("m092") }, { status: 404 });
  const rows = [
    [t("m162"), t("m163"), t("m164"), t("m039"), t("m165"), t("m166"), t("m167"), t("m168")],
  ];
  // Örnek URL satırlarına şablonu eklenir; şablonun kalan URL'leri analiz edilmediği için satırı yoktur.
  const templateOf = new Map<string, string>();
  for (const t of await getTemplates(id))
    if (t.status !== "MIXED") for (const u of t.samples) templateOf.set(u, t.pattern);
  for (const f of groupFindings(crawl.findings.map(f=>localizeFinding(f,locale))))
    for (const g of f.groups)
      for (const e of g.evidence)
        rows.push([
          t(severityLabel[f.severity]),
          f.code,
          f.title,
          String(e.url ?? ""),
          templateOf.get(String(e.url ?? "")) ?? "",
          f.code === "DUPLICATE_CONTENT" ? "" : (g.label ?? ""),
          details(e, ["deger"]),
          f.recommendation,
        ]);
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const date = (crawl.completedAt ?? crawl.createdAt).toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="seo-bulgulari-${crawl.normalizedHost.replace(/[^a-z0-9.-]/gi, "-")}-${date}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
