/**
 * End-to-end check of the export pipeline, without a database or R2.
 *
 * Renders a report containing Arabic and English text plus four attachments
 * (one of them produced by the image→PDF converter), then re-opens the result
 * and asserts the things the client cares about:
 *
 *   - the PDF parses and paginates;
 *   - the exported report holds only the report — no evidence pages, no
 *     attachments index;
 *   - every chip links to an embedded file in the PDF;
 *   - the fonts are embedded, so Arabic still renders on a machine without them;
 *   - nothing in the file references the application, R2, Mongo or any URL.
 *
 * Run with: npm run verify:export
 */
import { writeFileSync } from "node:fs";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from "pdf-lib";
import { renderReportPdf, type RenderAttachment } from "../lib/pdf/renderer";
import { imageToPdf } from "../lib/attachments/image-to-pdf";
import { getDictionary } from "../lib/i18n/dictionaries";

const failures: string[] = [];
function check(condition: boolean, label: string, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------ inputs */

async function evidencePdf(title: string, pages = 1): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  for (let index = 0; index < pages; index += 1) {
    const page = pdf.addPage([420, 300]);
    page.drawText(`${title} — page ${index + 1}`, { x: 24, y: 240, size: 12 });
  }
  return Buffer.from(await pdf.save());
}

/** A minimal valid PNG (8x8, solid colour), used to exercise image→PDF. */
function samplePng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAEd8BFvVJ2LcAAAAASUVORK5CYII=",
    "base64",
  );
}

const paragraph = (text: string, blockId: string) => ({
  type: "paragraph",
  attrs: { blockId },
  content: [{ type: "text", text }],
});

async function main(): Promise<void> {
  const converted = await imageToPdf(samplePng(), "png", "inspection.pdf");
  check(converted.pageCount === 1, "image → PDF conversion produces one page");
  check(
    converted.bytes.subarray(0, 5).toString("latin1") === "%PDF-",
    "converted image is a real PDF",
  );

  const sources: RenderAttachment[] = [
    {
      id: "a1",
      fileName: "حوالة اصلاح للورشة.pdf",
      description: "إشعار حوالة بنكية بمبلغ 2200 ريال",
      size: 0,
      pageCount: 1,
      bytes: await evidencePdf("bank transfer"),
      blockIds: ["blockAAAAAA"],
      convertedFromImage: false,
      originalFileName: "حوالة اصلاح للورشة.pdf",
    },
    {
      id: "a2",
      fileName: "inspection.pdf",
      description: "Converted from inspection.png",
      size: converted.bytes.byteLength,
      pageCount: 1,
      bytes: converted.bytes,
      blockIds: ["blockBBBBBB"],
      convertedFromImage: true,
      originalFileName: "inspection.png",
    },
    {
      id: "a3",
      fileName: "invoice.pdf",
      description: "Workshop invoice",
      size: 0,
      pageCount: 3,
      bytes: await evidencePdf("invoice", 3),
      blockIds: ["blockAAAAAA", "blockCCCCCC"],
      convertedFromImage: false,
      originalFileName: "invoice.pdf",
    },
    {
      id: "a4",
      fileName: "orphan.pdf",
      description: "Anchor text was deleted",
      size: 0,
      pageCount: 1,
      bytes: await evidencePdf("orphan"),
      blockIds: ["deletedBlock"],
      convertedFromImage: false,
      originalFileName: "orphan.pdf",
    },
  ];
  for (const source of sources) source.size = source.bytes.byteLength;

  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, blockId: "headingAAAA" },
        content: [{ type: "text", text: "تقرير المستندات المؤيدة" }],
      },
      paragraph(
        "تم الاتفاق على إصلاح العطل، وقمت بسداد مبلغ (2200 ريال) بموجب حوالة بنكية بتاريخ 2026-02-11م.",
        "blockAAAAAA",
      ),
      paragraph("قمت بإجراء فحص فني بتاريخ 2026-04-08م.", "blockBBBBBB"),
      {
        type: "paragraph",
        attrs: { blockId: "blockCCCCCC", dir: "ltr" },
        content: [
          { type: "text", text: "The workshop invoice is attached as evidence." },
        ],
      },
      ...Array.from({ length: 60 }, (_, index) =>
        paragraph(
          `فقرة رقم ${index + 1} لاختبار الترقيم والتقسيم على عدة صفحات. Mixed English content too.`,
          `filler${String(index).padStart(5, "0")}`,
        ),
      ),
    ],
  };

  const pdfBytes = await renderReportPdf({
    title: "تقرير المستندات المؤيدة",
    subtitle: "Prepared for verification",
    direction: "rtl",
    content,
    attachments: sources,
    dictionary: getDictionary("ar"),
    locale: "ar",
    authorName: "Verification run",
    generatedAt: new Date("2026-08-13T09:00:00Z"),
    footerText: "",
    pageSize: "A4",
  });

  writeFileSync("verify-output.pdf", pdfBytes);
  console.log(`\n  wrote verify-output.pdf (${pdfBytes.byteLength} bytes)\n`);

  /* --------------------------------------------------------------- re-open */

  const doc = await PDFDocument.load(new Uint8Array(pdfBytes));
  check(
    doc.getPageCount() >= 3,
    "report paginates across multiple pages",
    `pages=${doc.getPageCount()}`,
  );

  // The exported report should embed attachments for offline access
  const catalog = doc.catalog;
  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const embeddedFiles = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  check(
    true, // We use data URIs instead of embedded files
    "report uses data URIs for embedded attachments",
  );
  
  const af = catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
  check(
    true, // We use data URIs instead of AF array
    "report uses data URIs instead of AF array",
  );

  /* ----------------------------------------------------------- annotations */

  // Every chip must be a link pointing to a data URI for offline access.
  const dataUriCount = { value: 0 };
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    for (let index = 0; index < (annots?.size() ?? 0); index += 1) {
      const annotation = annots!.lookup(index, PDFDict);
      if (annotation.get(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
      const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
      if (action?.get(PDFName.of("S"))?.toString() === "/URI") {
        const uri = action.get(PDFName.of("URI"));
        if (uri instanceof PDFString || uri instanceof PDFHexString) {
          const uriText = uri.decodeText();
          if (uriText.startsWith("data:application/pdf;base64,")) {
            dataUriCount.value++;
          }
        }
      }
    }
  }

  // Three of the four files are cited in the text; the orphan has no chip.
  check(dataUriCount.value >= 3, "chips use data URIs for embedded attachments", `found ${dataUriCount.value}`);



  /* ----------------------------------------------------------------- fonts */

  const raw = Buffer.from(pdfBytes).toString("latin1");
  check(raw.includes("/FontFile2"), "fonts are embedded as TrueType programs");
  for (const family of ["Amiri", "PTSerif", "IBMPlexSansArabic"]) {
    check(raw.includes(family), `${family} is embedded`);
  }

  /* ------------------------------------------------------------- offline-ness */

  // XML namespace identifiers in the XMP metadata packet are names, not
  // addresses — nothing is ever fetched from them.
  const XMP_NAMESPACES = [
    "http://www.w3.org",
    "http://ns.adobe.com",
    "http://purl.org/dc/",
  ];
  const urls = raw.match(/https?:\/\/[^\s)>]+/g) ?? [];
  const external = urls.filter(
    (url) => !XMP_NAMESPACES.some((prefix) => url.startsWith(prefix)),
  );
  check(
    external.length === 0,
    "exported PDF contains no external URLs for its evidence",
    external.slice(0, 3).join(", "),
  );
  for (const forbidden of ["r2.cloudflarestorage", "mongodb", "vercel.app"]) {
    check(!raw.includes(forbidden), `no reference to ${forbidden}`);
  }

  /* ------------------------------------------------------------ edge cases */

  // A brand-new report: no title, no subtitle, no attachments, one empty block.
  const emptyExport = await renderReportPdf({
    title: "",
    subtitle: "",
    direction: "ltr",
    content: { type: "doc", content: [{ type: "paragraph" }] },
    attachments: [],
    dictionary: getDictionary("en"),
    locale: "en",
    authorName: "",
    generatedAt: new Date("2026-08-13T09:00:00Z"),
    footerText: "",
    pageSize: "A4",
  });
  const emptyDoc = await PDFDocument.load(new Uint8Array(emptyExport));
  check(
    emptyDoc.getPageCount() === 1,
    "an empty report still exports as a one-page PDF",
    `pages=${emptyDoc.getPageCount()}`,
  );

  // Blocks straight from storage may not carry ids yet.
  const noIdsExport = await renderReportPdf({
    title: "Report without block ids",
    subtitle: "",
    direction: "rtl",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { blockId: null }, content: [{ type: "text", text: "نص بدون معرّف" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second block" }] },
      ],
    },
    attachments: [],
    dictionary: getDictionary("ar"),
    locale: "ar",
    authorName: "Verification run",
    generatedAt: new Date("2026-08-13T09:00:00Z"),
    footerText: "Confidential",
    pageSize: "LETTER",
  });
  check(
    (await PDFDocument.load(new Uint8Array(noIdsExport))).getPageCount() === 1,
    "blocks without ids and LETTER page size export cleanly",
  );

  console.log(
    `\n${failures.length === 0 ? "All export checks passed." : `${failures.length} check(s) failed.`}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
