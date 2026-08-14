"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";

export interface ReportCard {
  id: string;
  title: string;
  direction: "rtl" | "ltr";
  updatedAt: string;
  attachmentCount: number;
}

export function ReportLibrary({
  initialReports,
}: {
  initialReports: ReportCard[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(initialReports);
  const [creating, setCreating] = useState(false);

  const dateFormat = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG" : "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );

  async function create() {
    setCreating(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction: locale === "ar" ? "rtl" : "ltr" }),
      });
      if (!response.ok) throw new Error("create failed");
      const { id } = (await response.json()) as { id: string };
      router.push(`/reports/${id}`);
    } catch {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t.library.deleteConfirm)) return;
    const snapshot = items;
    setItems((current) => current.filter((item) => item.id !== id));
    const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (!response.ok) setItems(snapshot);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-ui text-2xl font-medium tracking-tight">
            {t.library.title}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{t.library.subtitle}</p>
        </div>
        <Button variant="primary" onClick={create} disabled={creating}>
          {creating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          {creating ? t.library.creating : t.library.newReport}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="font-ui mt-10 rounded border border-dashed border-line-strong bg-paper px-6 py-12 text-center text-sm text-ink-faint">
          {t.library.empty}
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {items.map((report) => (
            <li
              key={report.id}
              className="group relative rounded border border-line bg-paper transition-colors hover:border-line-strong"
            >
              <Link href={`/reports/${report.id}`} className="block px-5 pt-5 pb-3">
                <h2
                  className="font-ui min-h-[3rem] text-base leading-snug font-medium"
                  dir={report.direction}
                >
                  {report.title || t.library.untitled}
                </h2>
              </Link>
              <div className="mx-5 border-t border-line" />
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="font-ui text-xs text-ink-faint">
                  {t.library.lastEdited} {dateFormat.format(new Date(report.updatedAt))}
                </span>
                <div className="flex items-center gap-2">
                  {report.attachmentCount > 0 ? (
                    <span className="font-ui inline-flex items-center gap-1 rounded-full bg-evidence/10 px-2 py-0.5 text-[0.6875rem] text-evidence">
                      <Paperclip className="size-3" aria-hidden />
                      {t.library.files(report.attachmentCount)}
                    </span>
                  ) : (
                    <span className="font-ui text-[0.6875rem] text-ink-faint">
                      {t.library.noEvidence}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(report.id)}
                    title={t.library.delete}
                    aria-label={`${t.library.delete}: ${report.title || t.library.untitled}`}
                    className="grid size-7 place-items-center rounded text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
