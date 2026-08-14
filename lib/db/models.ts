import type { ObjectId } from "mongodb";
import type { DocNode } from "@/lib/doc/schema";

export interface UserDoc {
  _id?: ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

/** Reading/writing direction of the report as a whole. */
export type Direction = "rtl" | "ltr";

export interface ReportDoc {
  _id?: ObjectId;
  ownerId: ObjectId;
  title: string;
  /** Optional line under the title in the exported PDF (author, recipient, ...). */
  subtitle: string;
  /** Base direction of the document. Individual blocks may override it. */
  direction: Direction;
  /** Validated ProseMirror/Tiptap document. Never raw HTML. */
  content: DocNode;
  createdAt: Date;
  updatedAt: Date;
}

export type AttachmentStatus = "ready" | "failed";

/**
 * Metadata for one piece of supporting evidence.
 *
 * The binary always lives in Cloudflare R2 under `storageKey`; Mongo only ever
 * holds metadata. Every attachment is stored as a PDF — images are converted on
 * upload — so the export step can embed it directly.
 */
export interface AttachmentDoc {
  _id?: ObjectId;
  reportId: ObjectId;
  ownerId: ObjectId;
  /** Stable IDs of the document blocks this evidence supports. */
  blockIds: string[];
  /** Display name, always ending in `.pdf`. */
  fileName: string;
  /** Name of the file as uploaded by the user, before any conversion. */
  originalFileName: string;
  /** MIME type of the uploaded original (e.g. image/jpeg). */
  originalMimeType: string;
  /** True when the stored PDF was produced by converting an image. */
  convertedFromImage: boolean;
  /** Key of the stored PDF in R2. */
  storageKey: string;
  /** Size of the stored PDF in bytes. */
  size: number;
  /** Number of pages in the stored PDF. */
  pageCount: number;
  /** Short caption shown in the attachments index and PDF file description. */
  description: string;
  status: AttachmentStatus;
  createdAt: Date;
  updatedAt: Date;
}
