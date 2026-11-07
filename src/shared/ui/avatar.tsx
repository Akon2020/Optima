import { cn } from "@/shared/lib/cn";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Avatar rond à initiales, avec pastille de présence facultative (§ 5.5). */
export function Avatar({
  name,
  size = "md",
  presence,
  className,
}: {
  name: string;
  size?: "sm" | "md";
  presence?: "online" | "away";
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-full bg-primary-subtle font-semibold text-text",
          size === "md" ? "size-9 text-xs" : "size-7 text-[10px]",
        )}
      >
        {initials(name)}
      </span>
      {presence ? (
        <span
          aria-hidden
          className={cn(
            "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface",
            presence === "online" ? "bg-success" : "bg-warning",
          )}
        />
      ) : null}
    </span>
  );
}
