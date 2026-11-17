"use client";

import {
  Building2,
  CircleCheck,
  Cloud,
  DatabaseBackup,
  Lock,
  ScrollText,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

import { SECURITY } from "../_content/landing";

type SecurityKey = (typeof SECURITY.items)[number]["icon"];

const ICONS: Record<SecurityKey, LucideIcon> = {
  isolation: ShieldCheck,
  roles: UserCog,
  audit: ScrollText,
  backup: DatabaseBackup,
};

/**
 * Principes de sécurité en accordéon (docs/LANDING_PAGE.md § 3, ligne 8) :
 * un principe ouvert à la fois, illustré à côté. Aucun défilement
 * automatique : rien ne bouge sans action du visiteur.
 */
export function SecurityList() {
  const baseId = useId();
  const [active, setActive] = useState<SecurityKey>("isolation");
  const Visual = VISUALS[active];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <ul className="space-y-2">
        {SECURITY.items.map((item) => {
          const isOpen = item.icon === active;
          const Icon = ICONS[item.icon];
          const panelId = `${baseId}-${item.icon}`;
          return (
            <li
              key={item.icon}
              className={cn(
                "rounded-2xl border transition-[background-color,border-color,box-shadow] duration-300",
                isOpen ? "border-border bg-surface shadow-card" : "border-transparent",
              )}
            >
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setActive(item.icon)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-base font-medium"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                      isOpen ? "bg-primary text-on-primary" : "bg-primary-subtle text-brand-text",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {item.title}
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-label={item.title}
                hidden={!isOpen}
                className="px-4 pb-4 pl-16 text-sm text-text-muted"
              >
                <p className="animate-enter">{item.text}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div
        aria-hidden
        className="relative overflow-hidden rounded-[1.75rem] border border-border bg-bg-subtle p-6 sm:p-10"
      >
        <div key={active} className="animate-enter">
          <Visual />
        </div>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-3.5 shadow-sm", className)}>
      {children}
    </div>
  );
}

function IsolationVisual() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      {[0, 1].map((index) => (
        <Card key={index} className={cn("space-y-2", index === 1 && "col-start-3")}>
          <Building2 className="size-4 text-brand-text" />
          <span className="block h-2 w-3/4 rounded-full bg-border-strong" />
          <span className="block h-1.5 w-1/2 rounded-full bg-border" />
          <span className="block h-1.5 w-2/3 rounded-full bg-border" />
        </Card>
      ))}
      <span className="col-start-2 row-start-1 grid size-11 place-items-center rounded-full bg-primary text-on-primary shadow-raised">
        <ShieldCheck className="size-5" />
      </span>
    </div>
  );
}

function RolesVisual() {
  const roles = [
    { label: "Propriétaire", isOpen: true },
    { label: "Gérant", isOpen: true },
    { label: "Serveur", isOpen: false },
    { label: "Poste de préparation", isOpen: false },
  ];
  return (
    <Card className="space-y-2.5">
      <span className="block border-b border-border pb-2.5 text-xs text-text-muted">
        Valider la journée de caisse
      </span>
      {roles.map((role) => (
        <span key={role.label} className="flex items-center justify-between gap-3 text-sm">
          {role.label}
          {role.isOpen ? (
            <CircleCheck className="size-4 text-success" />
          ) : (
            <Lock className="size-4 text-text-subtle" />
          )}
        </span>
      ))}
    </Card>
  );
}

function AuditVisual() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2].map((index) => (
        <Card key={index} className="flex items-center gap-3">
          <ScrollText className="size-4 text-brand-text" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-2 w-2/3 rounded-full bg-border-strong" />
            <span className="block h-1.5 w-1/3 rounded-full bg-border" />
          </span>
          <Lock className="size-3.5 text-text-subtle" />
        </Card>
      ))}
      <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs text-text-muted shadow-sm">
        <Lock className="size-3" />
        Ajout seul, rien ne s&apos;efface
      </span>
    </div>
  );
}

function BackupVisual() {
  return (
    <div className="flex items-center justify-center gap-4">
      <Card className="grid size-20 place-items-center">
        <DatabaseBackup className="size-7 text-brand-text" />
      </Card>
      <span className="h-px w-12 border-t border-dashed border-border-strong" />
      <Card className="relative grid size-20 place-items-center">
        <Cloud className="size-7 text-brand-text" />
        <CircleCheck className="absolute -right-2 -bottom-2 size-6 rounded-full bg-surface text-success" />
      </Card>
    </div>
  );
}

const VISUALS: Record<SecurityKey, () => ReactNode> = {
  isolation: IsolationVisual,
  roles: RolesVisual,
  audit: AuditVisual,
  backup: BackupVisual,
};
