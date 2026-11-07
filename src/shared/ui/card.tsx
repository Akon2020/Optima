import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

type CardProps = HTMLAttributes<HTMLElement> & {
  /** `showcase` : carte vitrine sombre, une seule mise en avant par écran (§ 5.5). */
  tone?: "default" | "showcase";
  as?: "section" | "div" | "article";
};

export function Card({ tone = "default", as: Tag = "section", className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card p-4 sm:p-6",
        tone === "default" && "bg-surface text-text shadow-card",
        tone === "showcase" &&
          "bg-surface-inverse text-text-inverse shadow-raised dark:ring-1 dark:ring-primary/40",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  titleId,
  description,
  action,
  className,
}: {
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 id={titleId} className="text-lg font-medium leading-tight sm:text-xl">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
