import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

/** Cadre des écrans de connexion, en charte générale (D-008). */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="text-lg font-bold tracking-[0.2em] text-primary">
        OPTIMA
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-2 text-sm text-text-muted">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer}
      <ThemeSwitcher showLabels />
    </main>
  );
}

export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-text">
      {message}
    </p>
  );
}
