import fs from "node:fs/promises";
import { createPdfReport } from "../.tmp-report/pdf-report.js";
import { createDocxReport } from "../.tmp-report/docx-report.js";
const long = "https://www.sky-e.app/urunler/kategori/cok-uzun-bir-turkce-url-adresi?filtre=profesyonel-arama-motoru-optimizasyonu&sirala=alfabetik&sayfa=";
const findings = Array.from({ length: 8 }, (_, index) => ({
  code: index === 0 ? "DUPLICATE_TITLE" : `SEO_${index}`,
  severity: index < 2 ? "CRITICAL" : index < 6 ? "WARNING" : "INFO",
  title: index === 0 ? "Tekrarlanan sayfa başlığı" : `Örnek SEO bulgusu ${index}`,
  description: "Başarılı HTML sayfalarında doğrulanan Türkçe açıklama. Yönlendirme gövdeleri bu bulguya dahil edilmez.",
  recommendation: "Etkilenen sayfayı inceleyin ve özgün, uygulanabilir SEO düzenlemesini tamamlayın.",
  urls: Array.from({ length: index === 0 ? 18 : 4 }, (_, urlIndex) => long + (index * 20 + urlIndex)),
  evidence: [JSON.stringify({ durum: "İyileştirilmeli", kanıt: "Başlık değeri aynı", örnek: "İçerik ve yönlendirme ayrımı doğrulandı." })],
}));
const data = { crawl: { id: "ornek", host: "www.sky-e.app", rootUrl: "https://www.sky-e.app/", status: "COMPLETED", createdAt: new Date("2026-09-24T10:00:00Z"), completedAt: new Date("2026-09-24T10:15:00Z"), processed: 112, discovered: 112, pending: 0, errors: 0, html: 80, redirects: 32, partialReason: null }, counts: { critical: 2, warning: 4, info: 2 }, findings, excluded: [{ url: long + "999", status: "EXCLUDED", reason: "robots.txt tarafından engellendi" }], comparison: { new: 2, ongoing: 5, resolved: 3, hasPrevious: true } };
await fs.mkdir("output/pdf", { recursive: true }); await fs.mkdir("output/docx", { recursive: true });
await fs.writeFile("output/pdf/seo-raporu-sky-e-ornek.pdf", await createPdfReport(data));
await fs.writeFile("output/docx/seo-raporu-sky-e-ornek.docx", await createDocxReport(data));
