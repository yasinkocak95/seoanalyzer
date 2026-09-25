import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { templateFindings, type ReportData } from "./report-data";
import { scoreLabel } from "./findings";
const blue = "2563EB",
  brand = "0F172A",
  border = "E2E8F0",
  body = "334155";
const text = (value: string, bold = false, color = body, size = 20) =>
  new TextRun({ text: value, bold, color, size, font: "Arial" });
const p = (value: string) =>
  new Paragraph({
    children: [text(value)],
    spacing: { after: 120, line: 300 },
  });
const link = (url: string) =>
  new Paragraph({
    children: [
      new ExternalHyperlink({
        link: url,
        children: [
          new TextRun({
            text: url,
            color: blue,
            underline: {},
            size: 16,
            font: "Arial",
          }),
        ],
      }),
    ],
    spacing: { after: 50 },
  });
export async function createDocxReport(data: ReportData) {
  const children: (Paragraph | Table)[] = [];
  children.push(
    new Paragraph({
      text: `${data.crawl.host} SEO Analiz Raporu`,
      heading: HeadingLevel.TITLE,
      spacing: { after: 180 },
    }),
    new Paragraph({
      children: [
        text(
          `Tarama tarihi: ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(data.crawl.completedAt ?? data.crawl.createdAt)}`,
          false,
          "64748B",
          18,
        ),
      ],
      spacing: { after: 300 },
    }),
    new Paragraph({ text: "Yönetici özeti", heading: HeadingLevel.HEADING_1 }),
  );
  if (data.score !== null)
    children.push(
      new Paragraph({
        children: [
          text(`SEO puanı: ${data.score}/100 `, true, brand, 30),
          text(
            `(${scoreLabel(data.score)})${data.previousScore !== null ? ` • önceki tarama: ${data.previousScore}` : ""}`,
            false,
            "64748B",
            20,
          ),
        ],
        spacing: { after: 200 },
      }),
    );
  if (data.crawl.skipped > 0)
    children.push(
      p(
        `Örneklemeli tarama: tekrar eden URL şablonlarından örnek analiz edildi. ${data.crawl.skipped.toLocaleString("tr-TR")} URL keşfedildi, analiz edilmedi. Bulgular ve puan örneklere dayanır; her URL için tam tarama yapılabilir.`,
      ),
    );
  const metrics = [
    ["İşlenen URL", data.crawl.processed],
    ["Analiz edilen HTML", data.crawl.html],
    ["Yönlendirme", data.crawl.redirects],
    ["Bekleyen URL", data.crawl.pending],
    ["Hatalı URL", data.crawl.errors],
    ["Kritik", data.counts.critical],
    ["İyileştirilmeli", data.counts.warning],
    ["Bilgi", data.counts.info],
  ];
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: metrics
            .slice(0, 4)
            .map(
              ([l, v]) =>
                new TableCell({
                  shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [text(String(v), true, brand, 28)],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [text(String(l), false, "64748B", 16)],
                    }),
                  ],
                }),
            ),
        }),
        new TableRow({
          children: metrics
            .slice(4)
            .map(
              ([l, v]) =>
                new TableCell({
                  shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [text(String(v), true, brand, 28)],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [text(String(l), false, "64748B", 16)],
                    }),
                  ],
                }),
            ),
        }),
      ],
      borders: {
        top: { style: BorderStyle.SINGLE, color: border, size: 4 },
        bottom: { style: BorderStyle.SINGLE, color: border, size: 4 },
        left: { style: BorderStyle.SINGLE, color: border, size: 4 },
        right: { style: BorderStyle.SINGLE, color: border, size: 4 },
        insideHorizontal: { style: BorderStyle.SINGLE, color: border, size: 4 },
        insideVertical: { style: BorderStyle.SINGLE, color: border, size: 4 },
      },
    }),
  );
  children.push(
    new Paragraph({
      text: "Öncelikli bulgular",
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
    }),
  );
  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  for (const f of [...data.findings].sort(
    (a, b) => order[a.severity] - order[b.severity],
  )) {
    const label =
      f.severity === "CRITICAL"
        ? "Kritik"
        : f.severity === "WARNING"
          ? "İyileştirilmeli"
          : "Bilgi";
    children.push(
      new Paragraph({
        text: f.title,
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
      }),
      new Paragraph({
        children: [
          text(
            `${label} • ${f.code} • ${f.urls.length.toLocaleString("tr-TR")} etkilenen URL`,
            true,
            f.severity === "CRITICAL"
              ? "DC2626"
              : f.severity === "WARNING"
                ? "B45309"
                : "64748B",
            17,
          ),
        ],
      }),
      p(f.description),
      new Paragraph({
        children: [text("Düzeltme: ", true, blue), text(f.recommendation)],
      }),
    );
    if (f.evidence[0])
      children.push(
        new Paragraph({
          children: [
            text("Kanıt: ", true),
            text(f.evidence[0], false, "64748B", 16),
          ],
        }),
      );
    if (f.templateHits.length) {
      children.push(
        new Paragraph({
          children: [text("URL şablonları", true, brand)],
          keepNext: true,
        }),
      );
      for (const h of f.templateHits)
        children.push(
          new Paragraph({
            children: [
              text(h.pattern, true, brand, 18),
              text(
                `  ${h.urls.length}/${h.sampleCount} örnekte görüldü • toplam ${h.discovered.toLocaleString("tr-TR")} URL keşfedildi, ${h.skipped.toLocaleString("tr-TR")} tanesi keşfedildi, analiz edilmedi`,
                false,
                "64748B",
                16,
              ),
            ],
          }),
        );
    }
    if (f.groups.some((g) => g.urls.length)) {
      children.push(
        new Paragraph({
          children: [
            text(
              f.templateHits.length ? "Şablon dışındaki URL’ler" : "Etkilenen URL’ler",
              true,
              brand,
            ),
          ],
          keepNext: true,
        }),
      );
      for (const g of f.groups) {
        if (g.label)
          children.push(
            new Paragraph({
              children: [text(`${g.label} • ${g.urls.length} URL`, true, body, 17)],
              keepNext: true,
              spacing: { before: 120 },
            }),
          );
        for (const url of g.urls) children.push(link(url));
      }
    }
  }
  if (data.templates.length) {
    children.push(
      new Paragraph({
        text: "URL grupları",
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      }),
      p(
        "Siteye özgü olarak URL yapısından tespit edilen şablonlar. Örneklerin sayfa yapısı farklı çıkan gruplar örneklenmedi, tamamı analiz edildi.",
      ),
    );
    for (const t of data.templates) {
      children.push(
        new Paragraph({ text: t.pattern, heading: HeadingLevel.HEADING_3, keepNext: true }),
        p(
          t.status === "MIXED"
            ? `Farklı sayfa türleri bulundu, tamamı analiz edildi • ${t.discovered.toLocaleString("tr-TR")} URL keşfedildi, ${t.analyzed.toLocaleString("tr-TR")} analiz edildi`
            : `${t.discovered.toLocaleString("tr-TR")} URL keşfedildi • ${t.analyzed} örnek analiz edildi • ${t.skipped.toLocaleString("tr-TR")} URL keşfedildi, analiz edilmedi`,
        ),
      );
      if (t.status !== "MIXED") children.push(p(templateFindings(data, t.pattern, t.samples.length)));
    }
  }
  children.push(
    new Paragraph({
      text: "Kontrol edildi, sorun yok",
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
    }),
  );
  if (data.passed) {
    children.push(
      p(
        `Uygulanan ${data.passed.length + data.findings.length} kontrolden ${data.passed.length} tanesi sorun bulmadı.`,
      ),
    );
    for (const r of data.passed)
      children.push(
        new Paragraph({
          children: [text(`✓ ${r.title}`, false, body, 19), text(`  ${r.code}`, false, "64748B", 15)],
        }),
      );
  } else
    children.push(
      p(
        "Bu tarama, kontrol listesi tutulmadan önceki bir sürümle yapıldı. Listeyi görmek için siteyi yeniden tarayın.",
      ),
    );
  children.push(
    new Paragraph({
      text: "Tarama kapsamı",
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
    }),
    p(
      `Tarama durumu: ${data.crawl.status === "COMPLETED" ? "Tamamlandı" : "Kısmi veya devam ediyor"}${data.crawl.partialReason ? ` - ${data.crawl.partialReason}` : ""}. Keşfedilen ${data.crawl.discovered} URL’nin ${data.crawl.processed} adedi işlendi. ${data.crawl.html} başarılı HTML sayfası içerik kurallarına dahil edildi. ${data.crawl.redirects} yönlendirme içerik sayfası olarak analiz edilmedi.`,
    ),
  );
  for (const item of data.excluded) {
    children.push(
      link(item.url),
      new Paragraph({
        children: [text(`${item.status}: ${item.reason}`, false, "64748B", 16)],
      }),
    );
  }
  children.push(
    new Paragraph({ text: "Karşılaştırma", heading: HeadingLevel.HEADING_1 }),
    p(
      data.comparison.hasPrevious
        ? `Önceki taramaya göre ${data.comparison.new} yeni, ${data.comparison.ongoing} devam eden ve ${data.comparison.resolved} çözülen bulgu vardır.`
        : "Karşılaştırılabilecek önceki tamamlanmış tarama bulunmuyor.",
    ),
  );
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 20, color: body },
          paragraph: { spacing: { after: 120, line: 300 } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: { size: 36, bold: true, color: "000000", font: "Arial" },
          paragraph: { spacing: { after: 200 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { size: 28, bold: true, color: "000000", font: "Arial" },
          paragraph: { spacing: { before: 300, after: 120 }, keepNext: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { size: 23, bold: true, color: "000000", font: "Arial" },
          paragraph: { spacing: { before: 220, after: 80 }, keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1000, right: 900, bottom: 1000, left: 900 } },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  text(`${data.crawl.host} • Sayfa `, false, "64748B", 16),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: "64748B",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
