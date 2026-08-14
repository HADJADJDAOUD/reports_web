import { ObjectId } from "mongodb";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import {
  loadOwnedReport,
  loadReportAttachments,
  toAttachmentDto,
  toReportDto,
} from "@/lib/reports/service";
import { getT } from "@/lib/i18n/server";
import { ReportEditor } from "@/components/editor/report-editor";

export const dynamic = "force-dynamic";

export default async function ReportEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const ownerId = new ObjectId(session.userId);
  const reportId = new ObjectId(id);

  let report;
  try {
    report = await loadOwnedReport(reportId, ownerId);
  } catch {
    notFound();
  }
  const files = await loadReportAttachments(reportId, ownerId);
  const { t } = await getT();

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 sm:px-6">
        <Link
          href="/reports"
          className="font-ui inline-flex items-center gap-1 text-xs text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />
          {t.editor.back}
        </Link>
      </div>
      <ReportEditor
        report={toReportDto(report)}
        initialAttachments={files.map(toAttachmentDto)}
        uploadMaxBytes={env.uploadMaxBytes}
      />
    </>
  );
}
