# Checkpoint — resume here

State of `D:\projects\Free\reports_web` at the end of the session on
**2026-08-15**. Written to pick the work up cold tomorrow.

- **Scope, architecture and every decision** → [`PROJECT.md`](PROJECT.md)
- **How to run, verify, deploy** → [`README.md`](README.md)
- **This file** → where things stand, what is open, what to do first.

---

## 1. Status

The MVP is built and pushed. `npm run build`, `npm run typecheck` and
`npx eslint .` are all clean. Working tree is clean; three commits on `master`,
pushed to `github.com/HADJADJDAOUD/reports_web`.

The client has been testing a deployed copy on desktop and on Android Chrome.
Desktop works end to end. **One open problem, on phones — see §2.**

### What works, confirmed by the client

- Sign in, create a report, write Arabic and English, format, save, reopen.
- Select text → **Add Attachment** → upload PDF or image → chip appears inline,
  anchored to that block and surviving edits.
- Export downloads the report and its attachments.

---

## 2. THE OPEN DECISION — start here tomorrow

**Problem:** on a phone, tapping a file reference in the exported report does
nothing. The file is downloaded and present, but the reference cannot reach it.

**Cause — a platform limit, not a bug.** Android and iOS hand a downloaded PDF to
the viewer through a sandboxed `content://` handle rather than a real filesystem
path. There is no "folder next to this file", and no mobile PDF viewer (Chrome
Android, iOS Safari/Files, Google Drive) resolves a relative link to a local
sibling file. iPhone will behave identically. Nothing that can be written into the
PDF changes this.

**The only mechanism that works on a phone is the evidence being inside the same
PDF.** A question was put to the client and is **unanswered** — this is the thing
to settle first:

| Option | What it means |
| --- | --- |
| **A — one PDF, evidence as annexes** *(recommended)* | Report body unchanged: text with small chips, nothing inline. After the report ends, an "Annexes / المرفقات" section: each attachment on its own page under a small header (`المرفق ١ — حوالة الورشة.pdf`). A chip jumps to that page. One file, no folder, no zip. Works on iPhone, Android, Chrome, Acrobat — offline — and is a single email attachment. This is how exhibits are filed behind a pleading, so the "not formal" objection may not apply to an annex section. |
| **B — leave as-is** | Keep report + separate files. References work on a computer only; on a phone the reader opens files from the folder by number. No code change. |
| **C — both, two buttons** | Export keeps the separate files for filing; a second button produces the single-file annex PDF for phones and email. |

Note the history before re-arguing this: the client explicitly rejected evidence
pages once ("the attachments should not appear in the pdf report page ever, its
not formal"). Option A differs in that the evidence sits in a clearly separated
annex section *after* the report, not among its paragraphs. If A is chosen, most
of the machinery already existed and was deleted — see the git history of
`lib/pdf/renderer.ts` for `drawAttachmentCovers`, and PROJECT.md §5a.

---

## 3. How the export works today

```
تقرير.pdf
attachments-<report-slug>/
├── 01-hwala-aslah.pdf
└── 02.pdf
```

- Each chip in the PDF is a **relative link** to its file. No embedded files, no
  attachments index page, no FileAttachment annotations, no ZIP — all were built
  and removed, for reasons recorded in PROJECT.md §5a.
- **Chrome/Edge desktop:** `showDirectoryPicker()` asks once for a location and the
  client writes the report and the folder itself. This is the only way a web page
  can create a folder — browsers strip path separators from the `download`
  attribute.
- **Everywhere else (incl. Android Chrome):** the files download side by side, and
  the report is rendered with **flat** links to match. Hence `?layout=folder|flat`
  on the export route.
- `lib/pdf/bundle.ts` is the single source of every name — folder, files, links.
  The renderer, the manifest route and the download route all read it. **If they
  drift, every reference breaks.**

There is also a **Share by email** button: it hands the report plus all files to
the device share sheet (`navigator.share` with files), so on a phone the user picks
Gmail and everything is attached. It fetches the report with *flat* links, because
email attachments all land in one folder. Desktop browsers without file sharing
download the files and open an empty `mailto:` draft instead — `mailto:` cannot
carry attachments, that parameter is not standard and is ignored everywhere.

---

## 4. Verification status — read before trusting the suites

| Suite | State |
| --- | --- |
| `npm run verify:bidi` | Last run **green**, 12/12 against bidi-js's reference implementation. Unaffected by recent changes. |
| `npm run verify:export` | **Updated but not re-run.** Its assertions were rewritten several times as the export format changed (no embedded files, links now relative, folder layout). Run it first tomorrow. |
| `npm run verify:api` | **Updated but not re-run.** Needs `npm run dev:sandbox` in another terminal. |
| `npm run build` / `typecheck` / `lint` | Clean as of the last change. |

Everything since the "phone support" commit was typechecked, linted and built, but
**not exercised at runtime** — the client asked for no test runs and said they
would test themselves.

---

## 5. Fixed this session

1. **Mobile: no "Add Attachment" on text selection.** The action was bound to
   `dblclick`, which Android Chrome does not reliably deliver — selection there is
   a long press. Now driven by the **selection** itself
   (`selectionTarget` in `extensions/attach-target.ts`), which covers double click,
   drag and long press identically. Opens on `pointerdown`, because a tap would
   otherwise collapse the selection before `click` arrived.
2. **Everything actionable was hover-gated**, so on a phone you could not remove a
   chip, replace/delete a file in the rail, or delete a report. Fixed with
   `@media (hover: none)`.
3. **Chips made much smaller**, names clipped to 10 characters including `.pdf`
   (`shortFileName` in `lib/attachments/file-types.ts`); full name on hover and in
   the rail.
4. **Untitled reports** no longer print the words "Untitled report" — the title
   area is left blank.
5. **Evidence list moved to a left rail** beside the document, sticky, dropping
   below the document on narrow screens.
6. Earlier in the session: export 500 on an empty subtitle, first-autosave 400 on
   `blockId: null`, and a spurious blank page from PDFKit's line wrapper.

---

## 6. Deployment

The repo is pushed. The deploy steps are in README §Deploying. Two things that
bite, both already documented there: MongoDB Atlas must allow `0.0.0.0/0`
(Vercel has no fixed IPs), and the R2 bucket needs a CORS rule allowing `PUT`
from the deployment origin, or browser uploads fail silently.

If the demo link should stop accepting new sign-ups, set
`AUTH_ALLOW_REGISTRATION=false` and redeploy.

---

## 7. Known limitations, honestly

- **Phone references do not open** — §2, the open decision.
- **Relative links depend on the desktop viewer.** Firefox's pdf.js and Acrobat
  follow them; Chrome desktop was observed following them correctly. If a viewer
  ever refuses, the fallback to try is a `/Launch` action instead of a URI action
  in `linkChipToFile` (`lib/pdf/renderer.ts`).
- **Re-exporting** the flat layout over an older set makes the browser save
  `01-x (1).pdf` while the links still point at `01-x.pdf`. The folder layout does
  not have this problem.
- **iOS Safari** may refuse `navigator.share` because files are fetched before the
  call, which can drop the user-activation. Android is fine.
- **Only JPEG and PNG** convert to PDF (`pdf-lib` limitation). No WebP or HEIC —
  HEIC matters for iPhone photos and would need a decoder that runs on Vercel.
- **Tashkeel-heavy Arabic** has not been looked at closely; leading is set
  generously (1.78) for that reason.

---

## 8. Orientation

| File | Why it matters |
| --- | --- |
| `lib/pdf/renderer.ts` | The PDF: custom bidi line layout on PDFKit, chips, tables, pagination, links |
| `lib/pdf/bidi-text.ts` | Atoms, bidi levels, mirroring — read the comment on `needsManualReverse` before touching Arabic |
| `lib/pdf/bundle.ts` | Single source of the export's folder and file names |
| `lib/pdf/export.ts` | Loads evidence from R2, decides layout, renders |
| `components/editor/report-editor.tsx` | Composition root: autosave, selection-driven attach, modals |
| `components/editor/extensions/block-id.ts` | Stable block ids — the anchor attachments hang from |
| `components/editor/extensions/attachment-chips.ts` | Chips as widget decorations; clicks delegated in the editor |
| `lib/attachments/service.ts` | Upload finalisation: magic-byte validation, image→PDF, R2 bookkeeping |
| `lib/doc/schema.ts` | The whitelist that keeps stored rich text safe |

### Conventions that are load-bearing

- **No callbacks inside Tiptap extensions.** Chip clicks are delegated from the
  document element. The React 19 lint rules (`react-hooks/refs`,
  `set-state-in-effect`) are enforced and will fail the build otherwise.
- **Never call PDFKit's `text()` with `width`/`align` for report content** — it
  bypasses the bidi pipeline and paginates on its own. Draw through `drawLines` /
  `drawSansLine`.
- `middleware.ts` is `proxy.ts` in Next 16; the export is `proxy`.
- Fonts in `assets/fonts` are committed on purpose and shipped to the export
  function via `outputFileTracingIncludes` in `next.config.ts`.
- `mupdf` is a devDependency kept for rasterising an export to check Arabic
  shaping by eye. Reading a rasterised crop is by far the fastest way to verify
  PDF output; write a throwaway script in a gitignored folder when needed.
