"use client";

import { CloudCheck, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/shared/lib/cn";

import { OFFLINE } from "../_content/landing";

type Step = "offline" | "sending" | "synced";

const STEPS: readonly Step[] = ["offline", "sending", "synced"];
/** Durée d'affichage de chaque état, en millisecondes. */
const STEP_MS: Record<Step, number> = { offline: 2600, sending: 1400, synced: 2600 };

/**
 * Petite démonstration des états de synchronisation (docs/LANDING_PAGE.md
 * § 3, ligne 7) : « Hors ligne, 3 opérations en attente », « Envoi en
 * cours », puis « Synchronisé ». Avec `prefers-reduced-motion`, l'animation
 * s'arrête sur les deux états extrêmes, affichés côte à côte. Décoratif : le
 * texte de la section dit la même chose.
 */
export function SyncDemo() {
  const [step, setStep] = useState<Step>("offline");
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIsReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isReducedMotion) return;
    const timer = window.setTimeout(() => {
      setStep((current) => STEPS[(STEPS.indexOf(current) + 1) % STEPS.length] ?? "offline");
    }, STEP_MS[step]);
    return () => window.clearTimeout(timer);
  }, [step, isReducedMotion]);

  if (isReducedMotion) {
    return (
      <div aria-hidden className="grid gap-3">
        <StatusCard step="offline" />
        <StatusCard step="synced" />
      </div>
    );
  }

  return (
    <div aria-hidden className="grid gap-3">
      <StatusCard step={step} />
      <PendingQueue isEmpty={step === "synced"} isSending={step === "sending"} />
    </div>
  );
}

function StatusCard({ step }: { step: Step }) {
  const { demo } = OFFLINE;
  const view = {
    offline: { Icon: WifiOff, title: demo.offline, detail: demo.pending, dot: "bg-warning" },
    sending: { Icon: RefreshCw, title: demo.sending, detail: demo.pending, dot: "bg-accent" },
    synced: { Icon: CloudCheck, title: demo.synced, detail: demo.syncedDetail, dot: "bg-success" },
  }[step];

  return (
    <div className="flex items-center gap-4 rounded-card bg-surface p-4 shadow-card">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-bg-subtle text-text">
        <view.Icon
          className={cn("size-5", step === "sending" && "animate-spin [animation-duration:1.6s]")}
        />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className={cn("size-2 rounded-full", view.dot)} />
          {view.title}
        </p>
        <p className="mt-0.5 text-sm text-text-muted">{view.detail}</p>
      </div>
    </div>
  );
}

function PendingQueue({ isEmpty, isSending }: { isEmpty: boolean; isSending: boolean }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-card border border-dashed border-border-strong px-4">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{ transitionDelay: `${index * 120}ms` }}
          className={cn(
            "h-6 flex-1 rounded-md bg-primary-subtle transition-[opacity,translate] duration-500",
            isSending && "translate-x-2 opacity-60",
            isEmpty && "translate-x-6 opacity-0",
          )}
        />
      ))}
    </div>
  );
}
