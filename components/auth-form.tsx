"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useLocale } from "@/lib/i18n/client";

export function AuthForm({
  mode,
  registrationOpen = true,
}: {
  mode: "login" | "register";
  registrationOpen?: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = isRegister
      ? {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }
      : {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Something went wrong.");
        setPending(false);
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/reports");
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-ui text-2xl font-medium tracking-tight">
        {isRegister ? t.auth.registerTitle : t.auth.signInTitle}
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        {isRegister ? t.auth.registerSubtitle : t.auth.signInSubtitle}
      </p>

      {isRegister && !registrationOpen ? (
        <p className="mt-8 rounded border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
          {t.auth.registrationClosed}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          {isRegister && (
            <TextField
              label={t.auth.name}
              name="name"
              autoComplete="name"
              required
              minLength={2}
            />
          )}
          <TextField
            label={t.auth.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            dir="ltr"
          />
          <TextField
            label={t.auth.password}
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            minLength={isRegister ? 8 : undefined}
            dir="ltr"
          />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? isRegister
                ? t.auth.creating
                : t.auth.signingIn
              : isRegister
                ? t.auth.register
                : t.auth.signIn}
          </Button>
        </form>
      )}

      <p className="mt-6 text-sm text-ink-soft">
        {isRegister ? t.auth.haveAccount : t.auth.noAccount}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="text-evidence underline underline-offset-2"
        >
          {isRegister ? t.auth.signInLink : t.auth.registerLink}
        </Link>
      </p>
    </div>
  );
}
