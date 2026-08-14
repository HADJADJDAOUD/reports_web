import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { attachments, reports } from "@/lib/db/mongo";
import { ReportLibrary, type ReportCard } from "@/components/library/report-library";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const ownerId = new ObjectId(session.userId);

  const [list, counts] = await Promise.all([
    (await reports())
      .find({ ownerId })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray(),
    (await attachments())
      .aggregate<{ _id: ObjectId; count: number }>([
        { $match: { ownerId } },
        { $group: { _id: "$reportId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const countByReport = new Map(
    counts.map((entry) => [entry._id.toHexString(), entry.count]),
  );

  const cards: ReportCard[] = list.map((report) => ({
    id: report._id!.toHexString(),
    title: report.title,
    direction: report.direction,
    updatedAt: report.updatedAt.toISOString(),
    attachmentCount: countByReport.get(report._id!.toHexString()) ?? 0,
  }));

  return <ReportLibrary initialReports={cards} />;
}
