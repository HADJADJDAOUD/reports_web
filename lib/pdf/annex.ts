import { PDFArray, PDFDocument, PDFName, type PDFRef } from "pdf-lib";
import type { ChipLink } from "./renderer";

/**
 * Second half of the mobile export: puts each attachment's real pages behind the
 * report and turns every chip into an internal jump to them.
 *
 * PDFKit cannot import pages from another PDF, so the renderer records where each
 * chip landed and pdf-lib does the merging here.
 *
 * Why pages at all: on a phone, a tap can only reach evidence that lives inside
 * the same file. A relative path has no sibling folder to resolve against
 * (viewers get a sandboxed `content://` handle), an embedded attachment needs an
 * attachments pane no mobile viewer has, and a web link needs a connection.
 */
export async function appendAnnexPages(params: {
  reportPdf: Buffer;
  attachments: { id: string; bytes: Buffer; fileName: string }[];
  chipLinks: ChipLink[];
}): Promise<Buffer> {
  const { reportPdf, attachments, chipLinks } = params;

  const report = await PDFDocument.load(new Uint8Array(reportPdf));
  if (attachments.length === 0) {
    return Buffer.from(await report.save({ useObjectStreams: false }));
  }

  /*
   * Appended in order after the last page of the report — no cover pages and no
   * index, so nothing is added that reads as part of the document. What follows
   * the report is simply the evidence, the way exhibits sit behind a pleading.
   */
  const targetIndex = new Map<string, number>();
  for (const attachment of attachments) {
    const firstPage = report.getPageCount();
    try {
      const source = await PDFDocument.load(new Uint8Array(attachment.bytes), {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      const pages = await report.copyPages(source, source.getPageIndices());
      for (const page of pages) report.addPage(page);
      if (pages.length > 0) targetIndex.set(attachment.id, firstPage);
    } catch (error) {
      // One unreadable upload must not fail the whole export; its chip simply
      // stays unlinked rather than jumping somewhere wrong.
      console.error(`Could not append ${attachment.fileName}`, error);
    }
  }

  // Chips live on body pages, which precede every insertion, so their own page
  // indices are still valid.
  const pages = report.getPages();
  for (const link of chipLinks) {
    const target = targetIndex.get(link.attachmentId);
    const sourcePage = pages[link.pageIndex];
    const targetPage = target === undefined ? undefined : pages[target];
    if (!sourcePage || !targetPage) continue;

    const context = report.context;
    const annotation = context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: link.rect,
      Border: [0, 0, 0],
      C: [],
      F: 4, // print
      A: context.obj({
        S: "GoTo",
        // `/XYZ null null null` jumps to the page and leaves the reader's zoom
        // alone, which is the least surprising behaviour across viewers.
        D: [targetPage.ref as PDFRef, PDFName.of("XYZ"), null, null, null],
      }),
    });
    const ref = context.register(annotation);

    const existing = sourcePage.node.lookup(PDFName.of("Annots"));
    if (existing instanceof PDFArray) existing.push(ref);
    else sourcePage.node.set(PDFName.of("Annots"), context.obj([ref]));
  }

  return Buffer.from(await report.save({ useObjectStreams: false }));
}
