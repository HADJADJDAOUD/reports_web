# Lexis — project scope, plan, and architecture

The document to read first when picking this project up again. It records **what
was agreed, why it is built the way it is, and where everything lives** — so a
future session (or developer) can orient in minutes instead of re-deriving the
design from the code.

- [`README.md`](README.md) — how to run, verify and deploy it.
- [`CHECKPOINT.md`](CHECKPOINT.md) — the state of the last working session.
- This file — scope, decisions, architecture.

---

## 1. Scope

### The one sentence

> Can I write a professional report, attach supporting PDF documents to specific
> parts of it, export it, download it, open it offline, and still access those
> documents?

Everything in this repository exists to answer that with "yes". The client
deliberately reduced the scope to this proof of concept.

### The flow that must work

```
LOGIN → CREATE REPORT → WRITE / EDIT → DOUBLE-CLICK TEXT → ATTACH FILE
      → SAVE → EXPORT → DOWNLOAD → OPEN OFFLINE → OPEN THE EVIDENCE
```

### In scope

| # | Requirement | Where it lives |
| --- | --- | --- |
| 1 | Authentication (needed only to *write*; never to read the exported PDF) | `lib/auth/*`, `app/(auth)/*`, `proxy.ts` |
| 2 | Report list / simple dashboard | `app/(app)/reports/page.tsx`, `components/library/*` |
| 3 | Create, save, reopen, edit a report | `app/api/reports/*`, `components/editor/report-editor.tsx` |
| 4 | Professional rich-text editor (headings, bold/italic/underline/strike, ordered + unordered lists, alignment, RTL/LTR, links, tables, undo/redo, clear formatting) | `components/editor/toolbar.tsx` |
| 5 | Arabic (RTL) and English (LTR), both correct, switchable per block | `lib/i18n/*`, `components/editor/extensions/text-direction.ts` |
| 6 | Double-click existing text → "Add Attachment" for **that block** | `report-editor.tsx` (`handleDoubleClick`), `extensions/attach-target.ts` |
| 7 | Upload PDF or image; images converted to PDF; PDFs kept as-is | `lib/attachments/*` |
| 8 | Multiple attachments per block; open, remove, replace | `evidence-list.tsx`, `app/api/reports/[id]/attachments/**` |
| 9 | Compact inline file chip in editor, preview and exported PDF | `extensions/attachment-chips.ts`, `lib/pdf/renderer.ts` |
| 10 | Autosave with a clearly visible save state | `report-editor.tsx`, `save-state.tsx` |
| 11 | Export the report with its evidence beside it, each reference clickable | `lib/pdf/*`, `app/api/reports/[id]/export/route.ts` |
| 12 | Offline access to the evidence, no dependency on our site, R2, Mongo or any URL | the bundle strategy in §5a |
| 13 | Arabic renders correctly on a machine with none of our fonts | fonts embedded and subset, §6 |

### Explicitly out of scope

Not built, and should not be added without a new conversation: dashboards beyond
the report list, teams, roles beyond "owner", billing, subscriptions,
notifications, analytics, AI of any kind, OCR, collaboration, advanced settings,
admin panel.

### Acceptance criteria (the client's list, and how each is met)

| Criterion | How |
| --- | --- |
| 1–2. Log in, create a report | Session JWT + `POST /api/reports` |
| 3–4. Write and format Arabic and English | Tiptap with per-block `dir`; Amiri + PT Serif in the editor, same pair in the PDF |
| 5–6. Double-click text, attachment action appears | `handleDoubleClick` resolves the nearest non-empty text block and offers the action anchored to it |
| 7–8. Upload a PDF, visibly associated with the right content | Chip decoration keyed on the block's `blockId` |
| 9–11. Upload an image, converted to PDF, becomes the attachment | `lib/attachments/image-to-pdf.ts`; the original image is deleted |
| 12–13. Multiple attachments; removable | `blockIds[]` is many-to-many; delete removes metadata and the R2 object |
| 14. Save and reopen | Autosave `PATCH`, document stored as validated ProseMirror JSON |
| 15–17. Export, with the report text and its file references | `renderReportPdf` |
| 18. Supporting PDFs travel with the report | Downloaded as sibling files beside the report (§5a) |
| 19–21. Works offline, evidence still reachable | Chips are relative links to the file beside the report — no network, no special reader, nothing to extract (§5a) |
| 22–23. Arabic and English render correctly offline | Fonts embedded; shaping, bidi and mirroring resolved at export time |
| 24. Professional look, correct pagination | Custom layout engine: no clipped text, no half-cut chips, tables split at line boundaries, repeated header rows |

---

## 2. How the work was planned

The order was chosen so that the riskiest unknown was settled before any product
code existed.

1. **Read the design references** (`designs/`) and the client's reference image
   for the attachment chip.
2. **Spike the hard part first: Arabic in a PDF.** Confirmed with throwaway
   scripts that (a) fonts could be obtained and embedded, (b) shaping works,
   and (c) bidi ordering has to be solved by us rather than by the viewer. Only
   then was the stack fixed.
3. **Foundations** — config, env, theme from the design tokens, i18n, Mongo, auth.
4. **Report CRUD + document model** — including the validation schema.
5. **Storage + attachment pipeline** — presigned uploads, validation, image→PDF.
6. **Editor** — Tiptap, block ids, chips, the double-click interaction, autosave.
7. **The PDF engine** — layout, bidi, chips, tables, pagination, linking.
8. **Verification and documentation.**

Steps 2 and 7 consumed most of the effort, which was the correct allocation: the
export is the only part the client cannot work around.

---

## 3. Technology, and why

| Choice | Reason |
| --- | --- |
| **Next.js 16** (App Router), React 19, TypeScript | Requested; single deployable, serverless-friendly |
| **Tailwind CSS v4** | Requested; design tokens map cleanly onto `@theme` |
| **Tiptap 3** | Requested; a real document model (ProseMirror) rather than an HTML blob, and decorations make the chip behaviour possible |
| **MongoDB Atlas** | Requested; document shape fits the report tree |
| **Cloudflare R2** via `@aws-sdk/client-s3` | Requested; S3-compatible, no egress fees |
| **`jose` + bcryptjs** rather than a framework | Basic auth was the requirement; a session JWT in an httpOnly cookie is ~80 lines and has no hidden behaviour |
| **PDFKit** for the export | Its fontkit integration applies OpenType shaping (correct Arabic joining), and it gives low-level control over annotations and page furniture |
| **`pdf-lib`** for image→PDF | Pure JavaScript; embeds JPEG/PNG without re-encoding; runs on Vercel with no native binaries |
| **`bidi-js`** | A faithful implementation of the Unicode Bidirectional Algorithm |
| **`mupdf`** (devDependency only) | An independent PDF engine, kept for rasterising an export to check Arabic shaping and chip placement by eye |

### Rejected alternatives

- **Headless Chromium (HTML → PDF).** Perfect text shaping, but a ~50 MB
  dependency, fragile on Vercel, and slow cold starts.
- **`pdf-lib` for the whole export.** Its `drawText` maps code points straight
  through the font's `cmap` — no shaping — so Arabic comes out as disconnected
  letterforms.
- **Storing the report as HTML.** Rejected by the brief, and it would make stable
  attachment anchors and safe re-rendering much harder.
- **Attachment chips as document nodes.** They would be deletable, splittable and
  paste-able into empty areas — exactly what the brief forbids. Decorations are
  the right primitive.

---

## 4. Architecture

### Request shape

```
Browser (React 19 client components)
  │
  ├── app/(auth)/*            login, register            → /api/auth/*
  ├── app/(app)/reports       list (server component, reads Mongo directly)
  └── app/(app)/reports/[id]  editor (server component loads, client edits)
        │
        ├── PATCH /api/reports/:id                       autosave
        ├── POST  /api/reports/:id/attachments/upload-url presign
        ├── PUT   → Cloudflare R2 directly                the bytes
        ├── POST  /api/reports/:id/attachments            finalise (validate, convert)
        ├── GET   /api/reports/:id/attachments/:aid/file   preview (proxied, ownership-checked)
        └── GET   /api/reports/:id/export                  the deliverable PDF
                    │
                    ├── Mongo   report + attachment metadata
                    ├── R2      attachment bytes
                    └── PDFKit  one self-contained PDF
```

`proxy.ts` (Next 16's renamed middleware) keeps signed-out visitors out of the
app shell. It is a convenience, not the security boundary — every API route
re-checks ownership.

### Data model

```
users        { _id, email (unique), name, passwordHash, createdAt }

reports      { _id, ownerId, title, subtitle,
               direction: "rtl" | "ltr",
               content: <validated ProseMirror document>,
               createdAt, updatedAt }

attachments  { _id, reportId, ownerId,
               blockIds: string[],        ← the link to content
               fileName,                  ← always ends in .pdf
               originalFileName, originalMimeType, convertedFromImage,
               storageKey,                ← Cloudflare R2; never bytes in Mongo
               size, pageCount, description, status,
               createdAt, updatedAt }
```

Indexes: `users.email` (unique), `reports.{ownerId, updatedAt}`,
`attachments.{reportId, createdAt}`, `attachments.blockIds`.

### The central design decision: stable block ids

```
Report
├── document blocks
│   ├── blockId      ← stable, 10-char id, assigned on load and on every edit
│   ├── type         ← paragraph | heading | listItem | tableCell | …
│   └── content
└── attachments
    ├── blockIds[]   ← which content this evidence supports (many-to-many)
    └── storageKey   ← where the PDF lives
```

`components/editor/extensions/block-id.ts` assigns an id to every block-level
node — in `onCreate` for documents loaded from storage, and in
`appendTransaction` for anything created afterwards. Duplicate ids (from a split
or a paste) are re-keyed so two blocks can never share an identity and inherit
each other's evidence.

Nothing is ever matched by text. Rewriting a sentence, reformatting it, moving it
or changing its direction leaves the attachment attached.

### Chips are decorations, not content

`extensions/attachment-chips.ts` renders each attachment as a ProseMirror
**widget decoration** at the end of the block's inline content. Consequences,
all of them deliberate:

- a chip cannot be typed over, split, or dragged into an empty area;
- chips flow with the text, so they wrap and follow the block's direction and
  alignment for free;
- what is rendered is derived from `blockIds`, so the editor cannot drift out of
  sync with the database;
- the chip carries no callbacks — clicks are handled once, by delegation, in
  `report-editor.tsx`. This keeps the React 19 lint rules satisfied and means
  the plugin never has to be rebuilt when React re-renders.

Attachments whose block was deleted are not lost: they appear in the evidence
list marked as unlinked, and in the exported PDF's attachments index under "not
referenced in the text".

### Upload pipeline

```
client                                     server
  │ POST upload-url {mimeType, size}  →     validate type + size, mint a key
  │                                          under reports/<id>/original/
  │ ← {uploadUrl, storageKey}
  │ PUT bytes ─────────────────────→ R2    (bypasses the serverless body limit)
  │ POST attachments {storageKey, …} →     read back from R2
  │                                        sniff magic bytes (declared MIME is a hint)
  │                                        PDF  → keep byte-for-byte, read page count,
  │                                                reject encrypted
  │                                        image → convert to a one-page PDF,
  │                                                store it, delete the original
  │ ← {attachment}                          insert metadata with blockIds
```

Presigned uploads exist because evidence can be tens of megabytes and a
serverless request body cannot. Validation happens on the **stored bytes**, never
on what the browser claimed.

---

## 5a. The export format — and why it changed three times

This is the most re-worked decision in the project. Read it before touching the
export.

**Attempt 1 — one PDF with the evidence embedded** (the original brief). Built and
correct to spec: EmbeddedFile streams, Filespecs, `/Names /EmbeddedFiles`, `/AF`,
FileAttachment annotations. Rejected in review:

> "How must a normal user open it with a specific app to see the attachments? I'm
> a lawyer, I don't have those apps — must I download Acrobat and pay a
> subscription to see files?"

PDF embedded files are only reachable in readers with an attachments pane, and
**Chrome and Edge have none**. The annotations also drew a note icon with a yellow
popup over the chip in some viewers. Correct, and useless to the actual reader.

**Attempt 2 — inline each attachment's pages into the report.** Rejected: it makes
the filed document non-formal.

**Attempt 3 — a ZIP holding the report and an `attachments/` folder**, chips
linking to relative paths. Rejected because it still needed a manual step: opening
the report straight out of the archive unpacks only that one file, so every link
reported "not found".

**Attempt 4 — sibling files in the downloads folder.** Worked, but dumped the
report and every attachment loose among the user's other downloads. Rejected as
messy.

**What ships — the report plus one folder named after it.**

```
تقرير.pdf
attachments-shkwa-bshan/
├── 01-hwala-aslah.pdf
└── 02.pdf
```

Chips link into that folder. Because browsers strip path separators from the
`download` attribute, a folder cannot be produced by ordinary downloads, so:

- **Chrome and Edge** — the File System Access API (`showDirectoryPicker`) asks
  once for a location and the client writes the report and the folder into it.
- **Everywhere else** — the files download side by side, and the report is
  rendered with flat links to match.

Which one is happening has to be known *before* rendering, because it changes what
the chips link to: hence `layout=folder|flat` on the export route, and
`ExportLayout` in `lib/pdf/bundle.ts`. Both paths read `/export/manifest`, so the
names on disk always match the links in the PDF.

**There is no ZIP.** It was tried (attempt 3) and rejected: unpacking is a manual
step, and a report previewed from inside an archive can never resolve its links.

### The constraint behind all five attempts

**A link inside a PDF can only open a file that exists on disk next to it.** That
single fact eliminates every alternative:

- Evidence inside an archive is not on disk until extracted — so no link can find
  it, and the extraction step is exactly what the client rejected.
- Evidence inside a nested `attachments.zip` cannot be linked to at all.
- Evidence embedded *in* the PDF is on disk, but only readers with an attachments
  pane can reach it.

Confirmed along the way: Chrome **does** follow a relative link out of a PDF (the
rejected build navigated to the right path and only failed because the file was
missing), so sibling files are a working mechanism, not a hope.

### Consequences to keep in mind

- `lib/pdf/bundle.ts` is the single source of every name: the folder, the files,
  and the links. The renderer, the manifest route and the download route all read
  it. If they drift, every reference breaks.
- The names are ASCII, no spaces, no folder — a link crosses a viewer's URI
  parser, the filesystem, and on Windows a code page.
- The folder name carries the report's slug so two exports never merge. Saving the
  same report twice into the same place overwrites it, which is the intent.
- Dismissing the folder picker is a cancel, not an error, and is silent.
- Moving the report away from its files breaks the references. The app says so
  after every export.

### What the exported PDF deliberately does not contain

No appended evidence pages, no attachments index page, no embedded-file payload,
no FileAttachment annotations, no ZIP. All were built and removed. If the request
becomes "make the PDF self-contained again", the trade-off is between *one file*,
*any viewer*, and *a formal-looking document* — only two of the three are ever
available at once.

## 5b. The export: how the PDF is rendered

`lib/pdf/renderer.ts` builds the document with PDFKit, but does its **own text
layout**. PDF content streams place glyphs at explicit coordinates and have no
concept of writing direction, so correct Arabic cannot be delegated to anything.

### Layout

The unit of layout is an **atom**: a maximal run of characters sharing a bidi
level, a script, and an inline style, containing either only whitespace or none.
Atoms are measured, ordered and drawn. Because Arabic shaping never crosses a
space, splitting at spaces is safe — and it makes justification, per-word
positioning and unbreakable chips fall out naturally.

```
inline content → atoms (bidi levels, mirroring applied)
              → greedy line breaking in logical order
              → per line: reorder atoms by UBA rule L2
              → draw each atom at an explicit x, at the line's baseline
```

An attachment chip is just another atom. That single decision is why a chip can
never be cut in half by a line break or a page break, and why it lands correctly
in both RTL and LTR paragraphs.

Also handled: headings (kept with the text they introduce), ordered and unordered
lists with markers on the leading edge, blockquotes, horizontal rules, tables
(column order mirrored for RTL, header rows repeated on continuation pages, rows
split at line boundaries so nothing is ever clipped), page numbers, footers, and
an attachments index page.

### Linking

Each chip gets a **link annotation** whose URI is the attachment's relative path
inside the bundle — nothing else. The PDF carries no copy of the evidence, which
also keeps the download at half the size it used to be.

Display names are de-duplicated (`name (2).pdf`) so two chips never read
identically, and the on-disk names carry a number prefix so they cannot collide
at all.

**No absolute URL is ever used.** The bundle references nothing outside itself —
not the application, not R2, not Mongo.

### Traps that were hit, and must not be re-introduced

1. **Arabic-Indic digits.** `٢٠٢٦` is Arabic *script* (so the font layer reverses
   it) but bidi gives it an even level (numbers read left to right). The two
   disagree, and reversal is needed exactly when they do — see
   `needsManualReverse` in `lib/pdf/bidi-text.ts`. Getting this wrong silently
   renders every Arabic-numeral date backwards.
2. **`getMirroredCharactersMap` takes the raw levels array**, not the result
   object the other bidi helpers take. Passing the wrong one fails silently and
   brackets come out unmirrored.
3. **Never call PDFKit's `text()` with `width` or `align` for report content.**
   That routes through its line wrapper, which knows nothing about bidi and will
   paginate on its own — it silently appended a blank page. Draw through
   `drawLines` / `drawSansLine`.
4. **Every value in the PDF `info` dict is written verbatim**; a key present with
   `undefined` throws. Build that object conditionally.

---

## 6. Fonts

Embedded and subset into every export, so the recipient needs nothing installed:

| Family | Role | Licence |
| --- | --- | --- |
| Amiri | Arabic body and headings (a Naskh with real Latin too) | SIL OFL 1.1 |
| PT Serif | Latin body and headings | SIL OFL 1.1 |
| IBM Plex Sans Arabic | Chips, page numbers, footers — covers both scripts in one design | SIL OFL 1.1 |

They live in `assets/fonts` (committed on purpose) and travel with the export
function via `outputFileTracingIncludes` in `next.config.ts`.

The editor loads the same families through `next/font`, so the writing surface is
a faithful preview of the printed result. Letters pick their own script; digits
and punctuation follow the paragraph direction, which keeps numerals inside an
Arabic sentence in the same family — and therefore the same optical size — as the
words around them. Amiri sits smaller on the em than PT Serif, so Arabic runs are
scaled by `ARABIC_SIZE_SCALE` and given looser leading.

---

## 7. Security posture

- Ownership is enforced **in the query**: every route loads by
  `{ _id, ownerId }`, so knowing an id is never enough.
- The R2 bucket is private. Previews are proxied through an ownership-checked
  route; uploads use short-lived presigned PUTs scoped to one server-generated
  key under the report's own prefix, and the finalise step rejects a key that
  does not belong to that report.
- R2 credentials never leave the server. There is no `NEXT_PUBLIC_*` variable in
  the project.
- Uploads are validated by magic bytes, size, and — for PDFs — that they parse
  and are not encrypted.
- Stored rich text is validated against a whitelist of node types, marks and
  attributes (`lib/doc/schema.ts`); links are limited to `http(s)`, `mailto`,
  `tel`. Unknown attributes are stripped rather than trusted.
- Sessions are httpOnly, `sameSite=lax`, `secure` in production; passwords are
  bcrypt-hashed at cost 12; login returns one message for both unknown email and
  wrong password.

---

## 8. File map

```
app/
  (auth)/                     login, register
  (app)/reports               library
  (app)/reports/[id]          editor page (server loads, client edits)
  api/auth/*                  register, login, logout
  api/reports/                list, create
  api/reports/[id]            get, save, delete
  api/reports/[id]/attachments/
    upload-url                presign
    (index)                   list, finalise
    [attachmentId]            patch, delete
    [attachmentId]/replace    swap the file, keep id and links
    [attachmentId]/file       ownership-checked preview stream
  api/reports/[id]/export     the deliverable PDF
components/
  editor/report-editor.tsx    the composition root: autosave, double-click, modals
  editor/toolbar.tsx          formatting controls
  editor/attach-dialog.tsx    presign → PUT → finalise
  editor/attachment-preview.tsx, evidence-list.tsx, export-button.tsx, save-state.tsx
  editor/extensions/
    block-id.ts               stable ids  ← the anchor everything hangs from
    attachment-chips.ts       chips as widget decorations
    attach-target.ts          highlights the block being attached to
    text-direction.ts         per-block RTL/LTR
  library/report-library.tsx, top-bar.tsx, language-toggle.tsx, ui/*
lib/
  pdf/renderer.ts             layout, chips, tables, pagination, embedding
  pdf/bidi-text.ts            atoms, bidi, mirroring, reversal rule
  pdf/fonts.ts, pdf/export.ts
  attachments/                file-types (sniffing), image-to-pdf, service
  doc/schema.ts               the validation whitelist
  auth/, db/, storage/, i18n/, api.ts, env.ts
scripts/
  dev-sandbox.ts              in-memory Mongo + local S3 stand-in, for demos
  verify-bidi.ts              ordering vs. the reference implementation
  verify-export.ts            renders a PDF, re-opens it, checks the embedding
  verify-api.ts               the whole product flow against a running server
assets/fonts/                 the three embedded families + their licences
designs/                      the client's Stitch references and chip image
```

---

## 9. Environment and deployment

All configuration is environment variables — see [`.env.example`](.env.example)
for the complete list with comments: `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`,
`AUTH_SESSION_DAYS`, `AUTH_ALLOW_REGISTRATION`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`,
`UPLOAD_MAX_MB`, `PDF_PAGE_SIZE`, `PDF_FOOTER_TEXT`.

Vercel needs nothing beyond those values: every route is serverless, the export
route runs on the Node runtime with `maxDuration = 60`, `pdfkit` is kept
unbundled via `serverExternalPackages`, and the fonts are traced into the
function. R2 needs a CORS rule allowing `PUT` from the deployment origin (the
exact JSON is in the README).

`npm run dev:sandbox` runs the whole app against an in-memory MongoDB and a
local S3-compatible stand-in, so it can be demonstrated with no credentials at
all. Same code paths; only the environment differs.

---

## 10. If the work continues

Where likely requests land:

| Request | Where |
| --- | --- |
| Chip appearance | `CHIP` + `drawChip` in `lib/pdf/renderer.ts` (export) and `.chip*` in `app/globals.css` (editor) — keep the two in step |
| Page size, margins, footer | `PDF_PAGE_SIZE`, `PDF_FOOTER_TEXT`, `MARGIN` |
| Typography | `BODY_SIZE`, `HEADING_SIZES`, `LEADING`, `BASELINE_RATIO`, `ARABIC_SIZE_SCALE` |
| A new block type in the PDF | `drawFlowNode` in the renderer, plus the node in `lib/doc/schema.ts` |
| More upload formats (WebP, HEIC) | needs a raster decoder; `pdf-lib` embeds only JPEG and PNG. Verify any new dependency runs on Vercel before adopting it |
| Sharing a report with another user | new concept; today ownership is a single `ownerId` and every query depends on it |

Three honest limitations to carry forward:

1. **The report and its files must stay in one folder.** A link cannot open a file
   that is not beside the report — see §5a. The app warns after each export, and
   re-exporting over an older set makes the browser rename the new files.
2. **Relative links in a PDF depend on the reader.** Firefox's pdf.js and Acrobat
   follow them; Chrome may block a `file://` → `file://` navigation depending on
   how the report was opened. Worth confirming on the client's own machines. If
   Chrome turns out to refuse them, the fallback to try is a `/Launch` action
   instead of a URI action in `linkChipToFile`.
3. **Tashkeel-heavy Arabic** has not been exercised at length. Leading is set
   generously (1.78) for exactly this reason, but a report full of full
   vocalisation is worth a visual check.
