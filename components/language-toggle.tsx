"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export function LanguageToggle({ size = "sm" }: { size?: "sm" | "md" }) {
  const { locale, t, setLocale, switching } = useLocale();
  return (
    <Button
      variant="ghost"
      size={size}
      disabled={switching}
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      title={t.nav.language}
    >
      <Languages className="size-4" aria-hidden />
      <span>{t.nav.language}</span>
    </Button>
  );
}
