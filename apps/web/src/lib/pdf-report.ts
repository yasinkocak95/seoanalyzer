// PDFKit'in zincirli API türleri tuple metrik değerlerini gereğinden dar yorumluyor.
// @ts-nocheck
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
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
        size: "A4",
        margins: { top: 54, bottom: 54, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `${data.crawl.host} SEO Analiz Raporu`,
          Author: "SEO Denetim",
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
    doc.fillColor(C.blue).fontSize(10).text("SEO DENETİM");
    doc
      .moveDown(0.5)
      .fillColor(C.brand)
      .fontSize(25)
      .text(`${data.crawl.host} SEO Analiz Raporu`, { width: 480 });
    doc
      .moveDown(0.4)
      .fillColor(C.muted)
      .fontSize(9)
      .text(
        `Tarama tarihi: ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(data.crawl.completedAt ?? data.crawl.createdAt)}`,
      );
    heading("Yönetici özeti");
    body(
      `Tarama durumu: ${data.crawl.status === "COMPLETED" ? "Tamamlandı" : "Kısmi veya devam ediyor"}${data.crawl.partialReason ? ` - ${data.crawl.partialReason}` : ""}`,
    );
    if (data.score !== null)
      doc
        .moveDown(0.3)
        .fillColor(C.brand)
        .fontSize(13)
        .text(
          `SEO puanı: ${data.score}/100 (${scoreLabel(data.score)})${data.previousScore !== null ? ` • önceki tarama: ${data.previousScore}` : ""}`,
        );
    if (data.crawl.skipped > 0)
      body(
        `Örneklemeli tarama: tekrar eden URL şablonlarından örnek analiz edildi. ${data.crawl.skipped.toLocaleString("tr-TR")} URL keşfedildi, analiz edilmedi. Bulgular ve puan örneklere dayanır; her URL için tam tarama yapılabilir.`,
      );
    const metrics = [
      ["İşlenen URL", data.crawl.processed],
      ["Analiz edilen HTML", data.crawl.html],
      ["Yönlendirme", data.crawl.redirects],
      ["Bekleyen URL", data.crawl.pending],
      ["Hatalı URL", data.crawl.errors],
      ["Kritik bulgu", data.counts.critical],
      ["İyileştirilmeli", data.counts.warning],
      ["Bilgilendirme", data.counts.info],
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
    heading("Öncelikli bulgular");
    const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    for (const finding of [...data.findings].sort(
      (a, b) => order[a.severity] - order[b.severity],
    )) {
      check(150);
      const label =
          finding.severity === "CRITICAL"
            ? "Kritik"
            : finding.severity === "WARNING"
              ? "İyileştirilmeli"
              : "Bilgi",
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
          `${finding.code} • ${finding.urls.length.toLocaleString("tr-TR")} etkilenen URL`,
        );
      doc.moveDown(0.25);
      body(finding.description);
      doc
        .moveDown(0.25)
        .fillColor(C.blue)
        .fontSize(9)
        .text(`Düzeltme: ${finding.recommendation}`, { lineGap: 2 });
      if (finding.evidence.length) {
        doc
          .moveDown(0.3)
          .fillColor(C.muted)
          .fontSize(8)
          .text(`Kanıt: ${finding.evidence[0]}`, { lineGap: 2 });
      }
      if (finding.templateHits.length) {
        doc.moveDown(0.35).fillColor(C.brand).fontSize(9).text("URL şablonları");
        for (const h of finding.templateHits) {
          check(36);
          doc.fillColor(C.brand).fontSize(8.5).text(h.pattern, { width: 490 });
          doc
            .fillColor(C.muted)
            .fontSize(7.5)
            .text(
              `${h.urls.length}/${h.sampleCount} örnekte görüldü • toplam ${h.discovered.toLocaleString("tr-TR")} URL keşfedildi, ${h.skipped.toLocaleString("tr-TR")} tanesi keşfedildi, analiz edilmedi`,
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
              ? "Şablon dışındaki URL’ler"
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
      heading("URL grupları");
      body(
        "Siteye özgü olarak URL yapısından tespit edilen şablonlar. Örneklerin sayfa yapısı farklı çıkan gruplar örneklenmedi, tamamı analiz edildi.",
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
              ? `Farklı sayfa türleri bulundu, tamamı analiz edildi • ${t.discovered.toLocaleString("tr-TR")} URL keşfedildi, ${t.analyzed.toLocaleString("tr-TR")} analiz edildi`
              : `${t.discovered.toLocaleString("tr-TR")} URL keşfedildi • ${t.analyzed} örnek analiz edildi • ${t.skipped.toLocaleString("tr-TR")} URL keşfedildi, analiz edilmedi`,
            { width: 490 },
          );
        if (t.status === "MIXED") continue;
        body(templateFindings(data, t.pattern, t.samples.length));
      }
    }
    heading("Kontrol edildi, sorun yok");
    if (data.passed) {
      body(
        `Uygulanan ${data.passed.length + data.findings.length} kontrolden ${data.passed.length} tanesi sorun bulmadı.`,
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
        "Bu tarama, kontrol listesi tutulmadan önceki bir sürümle yapıldı. Listeyi görmek için siteyi yeniden tarayın.",
      );
    heading("Tarama kapsamı");
    body(
      `Keşfedilen ${data.crawl.discovered.toLocaleString("tr-TR")} URL’nin ${data.crawl.processed.toLocaleString("tr-TR")} adedi işlendi. ${data.crawl.html.toLocaleString("tr-TR")} başarılı HTML sayfası içerik kurallarına dahil edildi. ${data.crawl.redirects.toLocaleString("tr-TR")} yönlendirme içerik sayfası olarak analiz edilmedi.`,
    );
    for (const item of data.excluded) {
      check(28);
      doc
        .fillColor(C.blue)
        .fontSize(7.5)
        .text(item.url, { link: item.url, width: 490 });
      doc.fillColor(C.muted).fontSize(7).text(`${item.status}: ${item.reason}`);
    }
    heading("Karşılaştırma");
    body(
      data.comparison.hasPrevious
        ? `Önceki taramaya göre ${data.comparison.new} yeni, ${data.comparison.ongoing} devam eden ve ${data.comparison.resolved} çözülen bulgu vardır.`
        : "Karşılaştırılabilecek önceki tamamlanmış tarama bulunmuyor.",
    );
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
          `${data.crawl.host} • Sayfa ${i + 1}/${range.count}`,
          50,
          doc.page.height - 40,
          { align: "center", width: 495, height: 12 },
        );
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}
