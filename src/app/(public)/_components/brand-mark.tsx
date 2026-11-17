import Link from "next/link";

import { cn } from "@/shared/lib/cn";

import { BRAND } from "../_content/landing";

/** Logotype « OPTIMA » (D-040), suivi de sa signature (D-068). */
export function BrandMark({
  withTagline = false,
  className,
}: {
  withTagline?: boolean;
  className?: string;
}) {
  return (
    <Link href="/" className={cn("flex min-w-0 items-baseline gap-3 rounded-md", className)}>
      <span className="text-lg font-bold tracking-[0.2em] text-brand-text">{BRAND.name}</span>
      {withTagline ? (
        <span className="hidden truncate border-l border-border pl-3 text-sm text-text-muted md:inline lg:hidden 2xl:inline">
          {BRAND.tagline}
        </span>
      ) : null}
      <span className="sr-only">, accueil</span>
    </Link>
  );
}
