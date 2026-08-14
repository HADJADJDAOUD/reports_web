"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/lib/i18n/client";

/**
 * Application chrome from the Stitch references: brand on one side, a single
 * "Documents" link, and account actions on the other. Optional `children` are
 * rendered as contextual actions (e.g. save state and Export in the editor).
 */
export function TopBar({
  userName,
  children,
}: {
  userName: string;
  children?: React.ReactNode;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-desk/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/reports"
          className="font-ui text-base font-semibold tracking-tight"
        >
          Lexis
        </Link>
        <Link
          href="/reports"
          className="font-ui hidden text-sm text-ink-soft transition-colors hover:text-ink sm:block"
        >
          {t.nav.reports}
        </Link>

        <div className="ms-auto flex items-center gap-1.5">
          {children}
          <LanguageToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            disabled={signingOut}
            title={t.nav.signOut}
            aria-label={t.nav.signOut}
          >
            <LogOut className="size-4" aria-hidden />
          </Button>
          <span
            className="font-ui grid size-7 select-none place-items-center rounded-full bg-surface-high text-[0.6875rem] font-medium text-ink-soft"
            title={userName}
          >
            {initials || "•"}
          </span>
        </div>
      </div>
    </header>
  );
}
