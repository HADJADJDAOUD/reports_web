import type { ObjectId } from "mongodb";
import { notFound } from "@/lib/api";
import { attachments, reports } from "@/lib/db/mongo";
import type { AttachmentDoc, ReportDoc } from "@/lib/db/models";

/**
 * Loads a report and asserts ownership in the same query, so a signed-in user
 * can never read or mutate somebody else's document.
 */
export async function loadOwnedReport(
  reportId: ObjectId,
  ownerId: ObjectId,
): Promise<ReportDoc> {
  const report = await (await reports()).findOne({ _id: reportId, ownerId });
  if (!report) throw notFound("Report not found");
  return report;
}

export async function loadReportAttachments(
  reportId: ObjectId,
  ownerId: ObjectId,
): Promise<AttachmentDoc[]> {
  return (await attachments())
    .find({ reportId, ownerId })
    .sort({ createdAt: 1 })
    .toArray();
}

/** Shape sent to the browser — no storage keys, no owner ids. */
export interface AttachmentDto {
  id: string;
  blockIds: string[];
  fileName: string;
  originalFileName: string;
  convertedFromImage: boolean;
  size: number;
  pageCount: number;
  description: string;
  createdAt: string;
}

export function toAttachmentDto(doc: AttachmentDoc): AttachmentDto {
  return {
    id: doc._id!.toHexString(),
    blockIds: doc.blockIds,
    fileName: doc.fileName,
    originalFileName: doc.originalFileName,
    convertedFromImage: doc.convertedFromImage,
    size: doc.size,
    pageCount: doc.pageCount,
    description: doc.description,
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface ReportDto {
  id: string;
  title: string;
  subtitle: string;
  direction: "rtl" | "ltr";
  content: ReportDoc["content"];
  createdAt: string;
  updatedAt: string;
}

export function toReportDto(doc: ReportDoc): ReportDto {
  return {
    id: doc._id!.toHexString(),
    title: doc.title,
    subtitle: doc.subtitle,
    direction: doc.direction,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
