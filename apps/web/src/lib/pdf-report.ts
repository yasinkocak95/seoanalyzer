// @ts-nocheck
import {translator,numberLocale,turkish} from '@seo/shared/i18n';
// PDFKit'in zincirli API türleri tuple metrik değerlerini gereğinden dar yorumluyor.
import PDFDocument from "pdfkit";
import fs from "node:fs";
import { templateFindings, type ReportData } from "./report-data";
import { scoreLabel } from "./findings";
const C = {
  brand: "#0F172A",
  blue: "#2563EB",
  page: "#F8FAFC",
  border: "#E2E8F0",
  body: "#334155",
  muted: "#64748B",
  red: "#DC2626",
  amber: "#B45309",
};
const font = () =>
  [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
  ].find(fs.existsSync);
export async function createPdfReport(data: ReportData) {
  const locale=data.locale,translate=translator(locale);
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
        size: "A4",
        margins: { top: 54, bottom: 54, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: translate("m332", [data.crawl.host]),
          Author: translate("m003"),
        },
      }),
      chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const f = font();
    if (f) doc.font(f);
    const check = (need = 90) => {
      if (doc.y + need > doc.page.height - 60) doc.addPage();
    };
    const heading = (text: string, size = 17) => {
      check(55);
      doc
        .moveDown(0.6)
        .fillColor(C.brand)
        .fontSize(size)
        .text(text, { continued: false })
        .moveDown(0.35);
    };
    const body = (text: string) =>
      doc.fillColor(C.body).fontSize(9.5).text(text, { lineGap: 3 });
    doc.fillColor(C.blue).fontSize(10).text(translate("m086"));
    doc
      .moveDown(0.5)
      .fillColor(C.brand)
      .fontSize(25)
      .text(translate("m332", [data.crawl.host]), { width: 480 });
    doc
      .moveDown(0.4)
      .fillColor(C.muted)
      .fontSize(9)
      .text(
        translate("m333", [new Intl.DateTimeFormat(numberLocale(locale), { dateStyle: "long", timeStyle: "short" }).format(data.crawl.completedAt ?? data.crawl.createdAt)]),
      );
    heading(translate("m058"));
    body(
      translate("m334", [data.crawl.status === "COMPLETED" ? translate("m076") : translate("m077"), data.crawl.partialReason ? ` - ${data.crawl.partialReason}` : ""]),
    );
    if (data.score !== null)
      doc
        .moveDown(0.3)
        .fillColor(C.brand)
        .fontSize(13)
        .text(
          translate("m087", [data.score, scoreLabel(data.score,locale), data.previousScore !== null ? translate("m060", [data.previousScore]) : ""]),
        );
    if (data.crawl.skipped > 0)
      body(
        translate("m061", [data.crawl.skipped.toLocaleString(numberLocale(locale))]),
      );
    const metrics = [
      [translate("m062"), data.crawl.processed],
      [translate("m325"), data.crawl.html],
      [translate("m024"), data.crawl.redirects],
      [translate("m341"), data.crawl.pending],
      [translate("m063"), data.crawl.errors],
      [translate("m340"), data.counts.critical],
      [translate("m036"), data.counts.warning],
      [translate("m339"), data.counts.info],
    ];
    doc.moveDown(0.7);
    const metricsY = doc.y;
    for (let i = 0; i < metrics.length; i++) {
      const x = 50 + (i % 4) * 125,
        y = metricsY + Math.floor(i / 4) * 46;
      doc
        .roundedRect(x, y, 115, 38, 5)
        .fillAndStroke(C.page, C.border)
        .fillColor(C.brand)
        .fontSize(14)
        .text(String(metrics[i][1]), x + 8, y + 6, { width: 99 })
        .fillColor(C.muted)
        .fontSize(7.5)
        .text(metrics[i][0], x + 8, y + 23, { width: 99 });
    }
    doc.x = 50;
    doc.y = metricsY + 100;
    heading(translate("m064"));
    const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    for (const finding of [...data.findings].sort(
      (a, b) => order[a.severity] - order[b.severity],
    )) {
      check(150);
      const label =
          finding.severity === "CRITICAL"
            ? translate("m035")
            : finding.severity === "WARNING"
              ? translate("m036")
              : translate("m037"),
        color =
          finding.severity === "CRITICAL"
            ? C.red
            : finding.severity === "WARNING"
              ? C.amber
              : C.muted;
      doc.fillColor(color).fontSize(8).text(label.toUpperCase());
      doc.fillColor(C.brand).fontSize(13).text(finding.title);
      doc
        .fillColor(C.muted)
        .fontSize(8)
        .text(
          translate("m338", [finding.code, finding.urls.length.toLocaleString(numberLocale(locale))]),
        );
      doc.moveDown(0.25);
      body(finding.description);
      doc
        .moveDown(0.25)
        .fillColor(C.blue)
        .fontSize(9)
        .text(translate("m088", [finding.recommendation]), { lineGap: 2 });
      if (finding.evidence.length) {
        doc
          .moveDown(0.3)
          .fillColor(C.muted)
          .fontSize(8)
          .text(translate("m089", [finding.evidence[0]]), { lineGap: 2 });
      }
      if (finding.templateHits.length) {
        doc.moveDown(0.35).fillColor(C.brand).fontSize(9).text(translate("m042"));
        for (const h of finding.templateHits) {
          check(36);
          doc.fillColor(C.brand).fontSize(8.5).text(h.pattern, { width: 490 });
          doc
            .fillColor(C.muted)
            .fontSize(7.5)
            .text(
              translate("m090", [h.urls.length, h.sampleCount, h.discovered.toLocaleString(numberLocale(locale)), h.skipped.toLocaleString(numberLocale(locale))]),
              { width: 490 },
            );
        }
      }
      if (finding.groups.some((g) => g.urls.length)) {
        doc
          .moveDown(0.35)
          .fillColor(C.brand)
          .fontSize(9)
          .text(
            finding.templateHits.length
              ? translate("m048")
              : "Etkilenen URL’ler",
          );
        for (const group of finding.groups) {
          if (group.label) {
            check(36);
            doc
              .moveDown(0.2)
              .fillColor(C.body)
              .fontSize(8)
              .text(`${group.label} • ${group.urls.length} URL`, { width: 490 });
          }
          for (const url of group.urls) {
            check(24);
            doc
              .fillColor(C.blue)
              .fontSize(7.5)
              .text(url, { link: url, underline: true, width: 490, lineGap: 1 });
          }
        }
      }
      doc.moveDown(0.8);
    }
    if (data.templates.length) {
      heading(translate("m068"));
      body(
        translate("m069"),
      );
      for (const t of data.templates) {
        check(60);
        doc
          .moveDown(0.4)
          .fillColor(C.brand)
          .fontSize(10)
          .text(t.pattern, { width: 490 });
        doc
          .fillColor(C.muted)
          .fontSize(8)
          .text(
            t.status === "MIXED"
              ? translate("m070", [t.discovered.toLocaleString(numberLocale(locale)), t.analyzed.toLocaleString(numberLocale(locale))])
              : translate("m071", [t.discovered.toLocaleString(numberLocale(locale)), t.analyzed, t.skipped.toLocaleString(numberLocale(locale))]),
            { width: 490 },
          );
        if (t.status === "MIXED") continue;
        body(templateFindings(data, t.pattern, t.samples.length));
      }
    }
    heading(translate("m344"));
    if (data.passed) {
      body(
        translate("m072", [data.passed.length + data.findings.length, data.passed.length]),
      );
      for (const rule of data.passed) {
        check(18);
        doc
          .fillColor(C.body)
          .fontSize(8.5)
          .text(`• ${rule.title} (${rule.code})`, { lineGap: 1 });
      }
    } else
      body(
        translate("m073"),
      );
    heading(translate("m074"));
    body(
      translate("m091", [data.crawl.discovered.toLocaleString(numberLocale(locale)), data.crawl.processed.toLocaleString(numberLocale(locale)), data.crawl.html.toLocaleString(numberLocale(locale)), data.crawl.redirects.toLocaleString(numberLocale(locale))]),
    );
    for (const item of data.excluded) {
      check(28);
      doc
        .fillColor(C.blue)
        .fontSize(7.5)
        .text(item.url, { link: item.url, width: 490 });
      doc.fillColor(C.muted).fontSize(7).text(`${item.status}: ${item.reason}`);
    }
    heading(translate("m078"));
    body(
      data.comparison.hasPrevious
        ? translate("m079", [data.comparison.new, data.comparison.ongoing, data.comparison.resolved])
        : translate("m080"),
    );
    if (data.comparison.unverified) body(`${translate('comparison.unverified')}: ${data.comparison.unverified}. ${translate('comparison.scope')}`);
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.x = 50;
      doc.y = doc.page.height - 40;
      doc
        .fillColor(C.muted)
        .fontSize(8)
        .text(
          translate("m335", [data.crawl.host, i + 1, range.count]),
          50,
          doc.page.height - 40,
          { align: "center", width: 495, height: 12 },
        );
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}
