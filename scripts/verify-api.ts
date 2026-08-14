/**
 * Walks the whole product flow against a running server:
 *
 *   register → create report → write content → presign → upload PDF → attach
 *   → upload image → converted to PDF → attach → save → export → inspect PDF
 *   → remove an attachment → confirm another account cannot read the report
 *
 * Point it at the local sandbox (`npm run dev:sandbox`) or at a deployment:
 *   BASE_URL=http://localhost:3000 npm run verify:api
 */
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } from "pdf-lib";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const failures: string[] = [];
function check(condition: boolean, label: string, detail = ""): void {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal cookie jar so the session cookie survives between requests. */
class Session {
  private cookie = "";

  async request(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    if (init.json !== undefined) headers.set("content-type", "application/json");

    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      redirect: "manual",
    });

    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookie) {
      const [pair] = entry.split(";");
      if (pair.startsWith("lexis_session=")) this.cookie = pair;
    }
    return response;
  }
}

async function evidencePdf(title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.addPage([420, 300]).drawText(title, { x: 24, y: 240, size: 12 });
  return pdf.save();
}

/** 8×8 PNG, so the image→PDF path runs on a genuinely decodable image. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAEd8BFvVJ2LcAAAAASUVORK5CYII=",
  "base64",
);

const BLOCK_A = "blockAAAAAA";
const BLOCK_B = "blockBBBBBB";

async function main(): Promise<void> {
  const stamp = Date.now();
  const session = new Session();

  /* ------------------------------------------------------------- accounts */

  const register = await session.request("/api/auth/register", {
    method: "POST",
    json: {
      name: "Verification User",
      email: `verify-${stamp}@example.com`,
      password: "correct horse battery",
    },
  });
  check(register.ok, "register creates an account and signs in", String(register.status));

  const unauthenticated = await fetch(`${BASE_URL}/api/reports`, {
    redirect: "manual",
  });
  check(unauthenticated.status === 401, "listing reports without a session is refused");

  /* -------------------------------------------------------------- report */

  const created = await session.request("/api/reports", {
    method: "POST",
    json: { direction: "rtl" },
  });
  check(created.ok, "report is created");
  const { id: reportId } = (await created.json()) as { id: string };

  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, blockId: "headingAAAA" },
        content: [{ type: "text", text: "شكوى بشأن إصلاح مركبة" }],
      },
      {
        type: "paragraph",
        attrs: { blockId: BLOCK_A },
        content: [
          {
            type: "text",
            text: "تم الاتفاق على إصلاح العطل، وقمت بسداد مبلغ (2200 ريال) بموجب حوالة بنكية بتاريخ 2026-02-11م.",
          },
        ],
      },
      {
        type: "paragraph",
        attrs: { blockId: BLOCK_B, dir: "ltr" },
        content: [
          { type: "text", text: "An independent inspection confirmed the fault." },
        ],
      },
    ],
  };

  const saved = await session.request(`/api/reports/${reportId}`, {
    method: "PATCH",
    json: { title: "شكوى بشأن إصلاح مركبة", subtitle: "Prepared for the committee", content },
  });
  check(saved.ok, "report content saves");

  const reopened = await session.request(`/api/reports/${reportId}`);
  const reopenedBody = (await reopened.json()) as {
    report: { title: string; content: { content?: { attrs?: { blockId?: string } }[] } };
  };
  check(
    reopenedBody.report.title === "شكوى بشأن إصلاح مركبة",
    "report reopens with its Arabic title intact",
  );
  check(
    reopenedBody.report.content.content?.[1]?.attrs?.blockId === BLOCK_A,
    "stable block ids survive the round trip",
  );

  const rejected = await session.request(`/api/reports/${reportId}`, {
    method: "PATCH",
    json: { content: { type: "doc", content: [{ type: "script", attrs: { onload: "x" } }] } },
  });
  check(rejected.status === 400, "unknown node types are rejected by the schema");

  /* ---------------------------------------------------------- attachments */

  async function attach(
    fileName: string,
    mimeType: string,
    bytes: Uint8Array,
    blockIds: string[],
    description: string,
  ) {
    const presign = await session.request(
      `/api/reports/${reportId}/attachments/upload-url`,
      { method: "POST", json: { mimeType, size: bytes.byteLength } },
    );
    if (!presign.ok) throw new Error(`presign failed: ${await presign.text()}`);
    const { uploadUrl, storageKey } = (await presign.json()) as {
      uploadUrl: string;
      storageKey: string;
    };

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": mimeType },
      body: new Blob([new Uint8Array(bytes)], { type: mimeType }),
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);

    const finalize = await session.request(`/api/reports/${reportId}/attachments`, {
      method: "POST",
      json: { storageKey, fileName, mimeType, blockIds, description },
    });
    if (!finalize.ok) throw new Error(`finalize failed: ${await finalize.text()}`);
    return (await finalize.json()) as {
      attachment: {
        id: string;
        fileName: string;
        convertedFromImage: boolean;
        pageCount: number;
        blockIds: string[];
      };
    };
  }

  const transfer = await attach(
    "حوالة اصلاح للورشة.pdf",
    "application/pdf",
    await evidencePdf("bank transfer"),
    [BLOCK_A],
    "إشعار حوالة بنكية",
  );
  check(
    transfer.attachment.fileName === "حوالة اصلاح للورشة.pdf" &&
      !transfer.attachment.convertedFromImage,
    "uploaded PDF is kept as-is with its Arabic file name",
  );

  const invoice = await attach(
    "invoice.pdf",
    "application/pdf",
    await evidencePdf("invoice"),
    [BLOCK_A],
    "Workshop invoice",
  );
  check(invoice.attachment.blockIds[0] === BLOCK_A, "a second file attaches to the same block");

  const image = await attach(
    "inspection.png",
    "image/png",
    PNG,
    [BLOCK_B],
    "Inspection photo",
  );
  check(
    image.attachment.convertedFromImage && image.attachment.fileName === "inspection.pdf",
    "uploaded image is converted to a PDF attachment",
    image.attachment.fileName,
  );

  const badType = await session.request(
    `/api/reports/${reportId}/attachments/upload-url`,
    { method: "POST", json: { mimeType: "application/zip", size: 1024 } },
  );
  check(badType.status === 400, "unsupported upload types are refused");

  const preview = await session.request(
    `/api/reports/${reportId}/attachments/${transfer.attachment.id}/file`,
  );
  check(
    preview.ok && preview.headers.get("content-type") === "application/pdf",
    "attachment preview streams the stored PDF",
  );

  /* ------------------------------------------------------------- replace */

  // Replacing swaps the file but must keep the attachment's identity and links.
  const replacementPresign = await session.request(
    `/api/reports/${reportId}/attachments/upload-url`,
    { method: "POST", json: { mimeType: "application/pdf", size: 900 } },
  );
  const { uploadUrl: replaceUrl, storageKey: replaceKey } =
    (await replacementPresign.json()) as { uploadUrl: string; storageKey: string };
  const replacementBytes = await evidencePdf("corrected transfer");
  await fetch(replaceUrl, {
    method: "PUT",
    headers: { "content-type": "application/pdf" },
    body: new Blob([new Uint8Array(replacementBytes)], { type: "application/pdf" }),
  });
  const replaced = await session.request(
    `/api/reports/${reportId}/attachments/${transfer.attachment.id}/replace`,
    {
      method: "POST",
      json: {
        storageKey: replaceKey,
        fileName: "حوالة مصححة.pdf",
        mimeType: "application/pdf",
      },
    },
  );
  const replacedBody = (await replaced.json()) as {
    attachment: { id: string; fileName: string; blockIds: string[] };
  };
  check(replaced.ok, "an attachment's file can be replaced");
  check(
    replacedBody.attachment.id === transfer.attachment.id &&
      replacedBody.attachment.blockIds[0] === BLOCK_A,
    "replacing keeps the attachment id and its block link",
  );
  check(
    replacedBody.attachment.fileName === "حوالة مصححة.pdf",
    "replacing updates the file name",
    replacedBody.attachment.fileName,
  );

  /* -------------------------------------------------------------- export */

  const exported = await session.request(`/api/reports/${reportId}/export`);
  check(exported.ok, "export returns a PDF", String(exported.status));
  const pdfBytes = Buffer.from(await exported.arrayBuffer());
  check(
    pdfBytes.subarray(0, 5).toString("latin1") === "%PDF-",
    "exported bytes are a PDF",
  );

  const doc = await PDFDocument.load(new Uint8Array(pdfBytes));
  const names = doc.catalog
    .lookupMaybe(PDFName.of("Names"), PDFDict)
    ?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict)
    ?.lookupMaybe(PDFName.of("Names"), PDFArray);

  const embedded = new Map<string, number>();
  for (let index = 0; index < (names?.size() ?? 0); index += 2) {
    const rawName = names!.lookup(index);
    const fileName =
      rawName instanceof PDFHexString || rawName instanceof PDFString
        ? rawName.decodeText()
        : String(rawName);
    const stream = names!
      .lookup(index + 1, PDFDict)
      .lookupMaybe(PDFName.of("EF"), PDFDict)
      ?.lookup(PDFName.of("F"));
    embedded.set(
      fileName,
      stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode().byteLength : 0,
    );
  }

  check(
    embedded.size === 3,
    "all three attachments are embedded in the export",
    [...embedded.keys()].join(", "),
  );
  check(
    embedded.has("حوالة مصححة.pdf"),
    "the Arabic file name survives into the embedded-files tree",
    [...embedded.keys()].join(", "),
  );
  check(
    (embedded.get("inspection.pdf") ?? 0) > 0,
    "the converted image is embedded as a PDF",
  );

  /* ------------------------------------------------------------- removal */

  const removed = await session.request(
    `/api/reports/${reportId}/attachments/${invoice.attachment.id}`,
    { method: "DELETE" },
  );
  check(removed.ok, "an attachment can be removed");

  const afterRemoval = await session.request(`/api/reports/${reportId}/attachments`);
  const remaining = (await afterRemoval.json()) as { attachments: unknown[] };
  check(remaining.attachments.length === 2, "removal is reflected in the attachment list");

  const goneFile = await session.request(
    `/api/reports/${reportId}/attachments/${invoice.attachment.id}/file`,
  );
  check(goneFile.status === 404, "a removed attachment is no longer readable");

  /* ------------------------------------------------------------ isolation */

  const other = new Session();
  const otherRegister = await other.request("/api/auth/register", {
    method: "POST",
    json: {
      name: "Other User",
      email: `other-${stamp}@example.com`,
      password: "another passphrase",
    },
  });
  check(otherRegister.ok, "a second account can register");

  const trespass = await other.request(`/api/reports/${reportId}`);
  check(trespass.status === 404, "another user cannot read this report");
  const trespassExport = await other.request(`/api/reports/${reportId}/export`);
  check(trespassExport.status === 404, "another user cannot export this report");
  const trespassFile = await other.request(
    `/api/reports/${reportId}/attachments/${transfer.attachment.id}/file`,
  );
  check(trespassFile.status === 404, "another user cannot read this report's files");

  console.log(
    `\n${failures.length === 0 ? "All API flow checks passed." : `${failures.length} check(s) failed.`}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error("\nverify:api crashed:", error);
  process.exit(1);
});
