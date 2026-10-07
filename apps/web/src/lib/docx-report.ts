import {translator,numberLocale,turkish} from '@seo/shared/i18n';
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
  const locale=data.locale,translate=translator(locale);
  const children: (Paragraph | Table)[] = [];
  children.push(
    new Paragraph({
      text: translate("m332", [data.crawl.host]),
      heading: HeadingLevel.TITLE,
      spacing: { after: 180 },
    }),
    new Paragraph({
      children: [
        text(
          translate("m333", [new Intl.DateTimeFormat(numberLocale(locale), { dateStyle: "long", timeStyle: "short" }).format(data.crawl.completedAt ?? data.crawl.createdAt)]),
          false,
          "64748B",
          18,
        ),
      ],
      spacing: { after: 300 },
    }),
    new Paragraph({ text: translate("m058"), heading: HeadingLevel.HEADING_1 }),
  );
  if (data.score !== null)
    children.push(
      new Paragraph({
        children: [
          text(translate("m059", [data.score]), true, brand, 30),
          text(
            `(${scoreLabel(data.score,locale)})${data.previousScore !== null ? translate("m060", [data.previousScore]) : ""}`,
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
        translate("m061", [data.crawl.skipped.toLocaleString(numberLocale(locale))]),
      ),
    );
  const metrics = [
    [translate("m062"), data.crawl.processed],
    [translate("m325"), data.crawl.html],
    [translate("m024"), data.crawl.redirects],
    [translate("m341"), data.crawl.pending],
    [translate("m063"), data.crawl.errors],
    [translate("m035"), data.counts.critical],
    [translate("m036"), data.counts.warning],
    [translate("m037"), data.counts.info],
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
      text: translate("m064"),
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
        ? translate("m035")
        : f.severity === "WARNING"
          ? translate("m036")
          : translate("m037");
    children.push(
      new Paragraph({
        text: f.title,
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
      }),
      new Paragraph({
        children: [
          text(
            translate("m337", [label, f.code, f.urls.length.toLocaleString(numberLocale(locale))]),
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
        children: [text(translate("m065"), true, blue), text(f.recommendation)],
      }),
    );
    if (f.evidence[0])
      children.push(
        new Paragraph({
          children: [
            text(translate("m066"), true),
            text(f.evidence[0], false, "64748B", 16),
          ],
        }),
      );
    if (f.templateHits.length) {
      children.push(
        new Paragraph({
          children: [text(translate("m042"), true, brand)],
          keepNext: true,
        }),
      );
      for (const h of f.templateHits)
        children.push(
          new Paragraph({
            children: [
              text(h.pattern, true, brand, 18),
              text(
                translate("m067", [h.urls.length, h.sampleCount, h.discovered.toLocaleString(numberLocale(locale)), h.skipped.toLocaleString(numberLocale(locale))]),
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
              f.templateHits.length ? translate("m048") : "Etkilenen URL’ler",
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
        text: translate("m068"),
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      }),
      p(
        translate("m069"),
      ),
    );
    for (const t of data.templates) {
      children.push(
        new Paragraph({ text: t.pattern, heading: HeadingLevel.HEADING_3, keepNext: true }),
        p(
          t.status === "MIXED"
            ? translate("m070", [t.discovered.toLocaleString(numberLocale(locale)), t.analyzed.toLocaleString(numberLocale(locale))])
            : translate("m071", [t.discovered.toLocaleString(numberLocale(locale)), t.analyzed, t.skipped.toLocaleString(numberLocale(locale))]),
        ),
      );
      if (t.status !== "MIXED") children.push(p(templateFindings(data, t.pattern, t.samples.length)));
    }
  }
  children.push(
    new Paragraph({
      text: translate("m344"),
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
    }),
  );
  if (data.passed) {
    children.push(
      p(
        translate("m072", [data.passed.length + data.findings.length, data.passed.length]),
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
        translate("m073"),
      ),
    );
  children.push(
    new Paragraph({
      text: translate("m074"),
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
    }),
    p(
      translate("m075", [data.crawl.status === "COMPLETED" ? translate("m076") : translate("m077"), data.crawl.partialReason ? ` - ${data.crawl.partialReason}` : "", data.crawl.discovered, data.crawl.processed, data.crawl.html, data.crawl.redirects]),
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
    new Paragraph({ text: translate("m078"), heading: HeadingLevel.HEADING_1 }),
    p(
      data.comparison.hasPrevious
        ? translate("m079", [data.comparison.new, data.comparison.ongoing, data.comparison.resolved])
        : translate("m080"),
    ),
  );
  if (data.comparison.unverified) children.push(p(`${translate('comparison.unverified')}: ${data.comparison.unverified}. ${translate('comparison.scope')}`));
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
                  text(translate("m336", [data.crawl.host]), false, "64748B", 16),
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
