import { LanguageToggle } from "@/components/language-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-desk">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="font-ui text-base font-semibold tracking-tight">
          Lexis
        </span>
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pb-16 pt-6 sm:items-center sm:pt-0">
        {children}
      </main>
    </div>
  );
}
