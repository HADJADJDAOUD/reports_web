# Lexis — reports with their evidence attached

Write a professional report, attach supporting PDF documents to specific parts of
it, export it, download it, open it offline, and still reach those documents —
without installing anything.

That single sentence is the whole product. Everything here serves it.

---

## The flow

```
sign in → create report → write (Arabic / English) → double-click text
        → attach PDF or image → save → export → download → open offline
        → click a file reference → the document opens
```

## How it works

| Concern | Approach |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Editor | Tiptap 3 — stored as a validated ProseMirror document, never an HTML string |
| Data | MongoDB Atlas — users, reports, document structure, attachment metadata |
| Files | Cloudflare R2 — the binaries only; nothing binary is ever stored in Mongo |
| Auth | Session JWT (`jose`, HS256) in an httpOnly cookie, bcrypt password hashes |
| PDF | PDFKit for layout, `pdf-lib` for image→PDF, `bidi-js` for ordering |
| Deploy | Vercel — every route is serverless, no persistent server, no native binaries |

### Attachments belong to content, not to positions

Every block-level node in the document carries a **stable `blockId`**, assigned
by [`components/editor/extensions/block-id.ts`](components/editor/extensions/block-id.ts)
as soon as a document loads. Attachments store `blockIds`, so evidence stays
attached while the surrounding sentence is rewritten, reordered or reformatted.
Nothing is ever matched by text.

Chips are **ProseMirror widget decorations**
([`attachment-chips.ts`](components/editor/extensions/attachment-chips.ts)),
not document nodes. They are painted into the report but are not part of the
editable text, which is what stops an attachment from being typed over, split in
half, or left floating in an empty area of the page.

```
Report
├── document blocks        (paragraph / heading / list item / cell …)
│   ├── blockId            stable, survives edits
│   ├── type
│   └── content
└── attachments
    ├── fileName, size, pageCount, description
    ├── storageKey         → Cloudflare R2
    └── blockIds[]         → the content this evidence supports
```

### Every attachment is a PDF

Uploaded PDFs are kept byte-for-byte — never rasterised, never re-encoded.
Uploaded JPEG/PNG images are converted to a single-page PDF with `pdf-lib`
(pure JavaScript, no ImageMagick, no LibreOffice, works unchanged on Vercel) and
the original image is deleted. The converted PDF is the evidence from then on.

Uploads are validated on the **stored bytes** by magic number, not on the MIME
type the browser claimed.

### The export: the report, plus its attachments folder

Pressing Export produces exactly this on disk:

```
تقرير.pdf
attachments-shkwa-bshan/
├── 01-hwala-aslah.pdf
└── 02.pdf
```

Every file reference in the report is a **relative link into that folder**. Open
the report, click a reference, and the document opens in a new tab — in Chrome or
any PDF viewer, offline, with nothing installed.

Ordinary downloads cannot create a folder: every browser strips path separators
out of the `download` attribute, and Chromium has declined to change it. So where
the **File System Access API** exists (Chrome, Edge) the export asks once for a
location and writes the report and the folder into it directly.

Browsers without that API download the files side by side instead, and the report
is rendered with matching flat links — hence `?layout=folder|flat` on the export
route. There is no ZIP anywhere: nothing should ever need unpacking.

The folder is named after the report (`attachments-<slug>`, or the last 8
characters of the report id when the title has nothing ASCII in it), so two
exports never merge into each other.

Names of things a link touches are plain ASCII with no spaces. A link crosses a
PDF viewer's URI parser, the filesystem and, on Windows, a code page, and
percent-encoded Arabic does not survive that reliably. Readable names still show
on the chip and in the app, and the number prefix follows citation order.

The one rule for the reader: **keep the report and its folder together.**

The exported PDF contains **only the report** — no appended evidence pages, no
attachments index, no embedded-file payload, no FileAttachment annotations. Every
one of those was built and then removed; [PROJECT.md](PROJECT.md) §5a records why,
and is worth reading before proposing any of them again.

Nothing in the export points at this app, at R2, or at any URL.

### Arabic that stays correct on someone else's computer

Three separate problems, all solved server-side:

1. **Shaping** — Amiri (Naskh) is embedded and subset into the output, and glyphs
   are shaped through the font's OpenType tables, so letters join and ligate.
2. **Bidirectional ordering** — `(2200 ريال)` and `2026-02-11` inside an Arabic
   sentence are ordered by the Unicode Bidirectional Algorithm via `bidi-js`
   ([`lib/pdf/bidi-text.ts`](lib/pdf/bidi-text.ts)), then drawn run by run at
   explicit positions. PDF content streams have no notion of direction, so this
   cannot be left to the viewer.
3. **Mirroring** — brackets and similar characters are swapped for their mirrored
   forms inside right-to-left runs.

Fonts are embedded, so the recipient needs nothing installed:

| Family | Used for | Licence |
| --- | --- | --- |
| Amiri | Arabic body and headings | SIL OFL 1.1 |
| PT Serif | Latin body and headings | SIL OFL 1.1 |
| IBM Plex Sans Arabic | Chips, page numbers, footers (both scripts) | SIL OFL 1.1 |

Licence texts sit next to the files in [`assets/fonts`](assets/fonts).

---

## Running it

### With your own MongoDB Atlas and R2

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

### Without any credentials (for a demo)

Starts an in-memory MongoDB and a local S3-compatible store, then runs the app
against them through exactly the same code paths:

```bash
npm run dev:sandbox
```

Open http://localhost:3000, create an account, and the full flow works. Data
lives only for the lifetime of the process.

---

## Verifying it

```bash
npm run verify:bidi     # bidi ordering vs. the reference implementation
npm run verify:export   # renders a PDF, then re-opens it and checks the links
npm run verify:api      # the whole product flow against a running server
npm run typecheck
npm run lint
npm run build
```

`verify:export` writes `verify-output.pdf` and asserts, among other things, that
every chip is a resolvable relative link, that the fonts are embedded, that the
report carries no evidence payload of its own, and that nothing in the file points
at an external URL.

`verify:api` needs a server (`npm run dev:sandbox` in another terminal) and
covers registration, saving, block-id stability, image→PDF conversion,
attachment removal, export, and that a second account cannot read the first
account's report, export, or files.

---

## Viewer support, honestly

The evidence is reached by a **relative link** inside the report, so what matters
is whether a viewer follows relative links — and whether the file is on disk next
to the report.

**Checked by `npm run verify:export`**: the report renders and paginates, Arabic is
shaped and ordered correctly, every chip is a relative link to its file, those
links are ASCII with no spaces, and the PDF carries no evidence payload.

**Not tested on this machine** — no Acrobat Reader or Firefox installed here — so
the rest is documented behaviour, worth confirming on the client's own machines:

| Viewer | Clicking a file reference |
| --- | --- |
| Firefox (pdf.js) | expected yes — resolves relative links against the document's location |
| Adobe Acrobat Reader | expected yes — may ask once for permission to open an external file |
| macOS Preview | expected yes |
| Chrome / Edge built-in viewer | usually yes; a `file://` → `file://` navigation can be blocked depending on how the report was opened |

The one guaranteed failure mode is **separating the report from its files** — no
link can find a file that is not there. If a viewer refuses relative links
altogether, the documents are still sitting right beside the report, numbered in
the order they are cited.

---

## Security

- Report and attachment ownership is enforced in the query itself; every route
  loads by `{ _id, ownerId }`, so one user's id is never enough to reach another
  user's data.
- The R2 bucket stays private. Previews are proxied through an
  ownership-checked route; uploads use short-lived presigned PUTs scoped to a
  single server-generated key under the report's prefix.
- R2 credentials never leave the server, and no `NEXT_PUBLIC_*` variable exists.
- Uploads are checked for type (magic bytes), size, and — for PDFs — that they
  parse and are not encrypted.
- Stored document content is validated against a whitelist of node types, marks
  and attributes ([`lib/doc/schema.ts`](lib/doc/schema.ts)); links are limited to
  `http(s)`, `mailto` and `tel`.
- Sessions are httpOnly, `sameSite=lax`, and `secure` in production.

---

## Deploying to Vercel

1. Push the repository and import it in Vercel.
2. Set the variables from [`.env.example`](.env.example) in the project settings.
3. Deploy. Nothing else is needed:
   - the export route runs on the Node runtime with `maxDuration = 60`;
   - `next.config.ts` keeps `pdfkit` unbundled and ships `assets/fonts` with the
     export function via `outputFileTracingIncludes`;
   - all state lives in MongoDB Atlas and Cloudflare R2.

For R2, allow `PUT` from your deployment origin in the bucket's CORS policy so
browser uploads succeed:

```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Deliberately not built

No dashboards, teams, billing, roles, notifications, analytics, AI, OCR,
collaboration, or admin panel. The scope is the sentence at the top of this file.
