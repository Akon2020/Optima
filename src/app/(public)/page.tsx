import { ArrowRight, Building2, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { buttonClasses } from "@/shared/ui/button";

import { BENEFIT_VISUALS } from "./_components/benefit-visuals";
import { HeroDashboard } from "./_components/hero-dashboard";
import { ModulesTabs } from "./_components/modules-tabs";
import { REVEAL_CLASSES } from "./_components/reveal";
import { RevealObserver } from "./_components/reveal-observer";
import { SecurityList } from "./_components/security-list";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";
import { SyncDemo } from "./_components/sync-demo";
import {
  BENEFITS,
  BRAND,
  DAY,
  DEMO,
  FINAL_CTA,
  HERO,
  LOGIN,
  MODULES,
  OFFLINE,
  PROBLEMS,
  SECURITY,
} from "./_content/landing";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} · ${BRAND.tagline}` },
  alternates: { canonical: "/" },
};

/** Délai d'entrée, pour échelonner les éléments du hero. */
function enterDelay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

/** Décalage d'apparition au défilement, pour échelonner une liste. */
function revealDelay(index: number): CSSProperties {
  return { transitionDelay: `${index * 110}ms` };
}

/** Bandes verticales translucides et halo du haut (hero, appel final). */
function GlassBackdrop({ isInverse = false }: { isInverse?: boolean }) {
  const stripe = isInverse ? "var(--color-text-inverse)" : "var(--color-surface)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0 72px, color-mix(in oklab, ${stripe} ${isInverse ? 8 : 55}%, transparent) 72px 73px)`,
        }}
        className="absolute inset-0"
      />
      <div
        style={{
          backgroundImage: `radial-gradient(60% 55% at 50% 0%, color-mix(in oklab, ${stripe} ${isInverse ? 14 : 70}%, transparent), transparent)`,
        }}
        className="absolute inset-0"
      />
    </div>
  );
}

/** Pastille au-dessus d'un titre de section. */
function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted shadow-sm",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

/**
 * Landing page (docs/LANDING_PAGE.md, D-051, D-068) : composants serveur ;
 * l'en-tête, les onglets des modules, l'accordéon de sécurité, la
 * démonstration de synchronisation et l'observateur d'apparition sont côté
 * client. Animations sobres, en CSS autant que possible, toutes coupées
 * par `prefers-reduced-motion`. Textes dans `_content/landing.ts`.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
        {/* Hero : le panneau remonte sous la barre flottante. */}
        <div className="-mt-17 px-3 pt-3 sm:px-4">
          <section
            aria-labelledby="hero-title"
            className="relative overflow-hidden rounded-[2rem] border border-border bg-primary-subtle"
          >
            <GlassBackdrop />
            <div className="relative mx-auto max-w-6xl px-4 pt-28 text-center sm:px-6 sm:pt-36">
              <div style={enterDelay(0)} className="animate-enter">
                <Eyebrow>{HERO.eyebrow}</Eyebrow>
              </div>
              <h1
                id="hero-title"
                style={enterDelay(90)}
                className="mx-auto mt-6 max-w-4xl animate-enter text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl"
              >
                {HERO.titleLead}{" "}
                <span
                  aria-hidden
                  className="mx-1 inline-grid h-[0.9em] w-[1.6em] translate-y-[0.08em] place-items-center rounded-full bg-primary align-baseline text-on-primary"
                >
                  <Building2 className="size-[0.5em]" />
                </span>{" "}
                {HERO.titleIconWord}{" "}
                <span className="block text-brand-text">{HERO.titleAccent}</span>
              </h1>
              <p
                style={enterDelay(180)}
                className="mx-auto mt-6 max-w-2xl animate-enter text-base text-text-muted sm:text-lg"
              >
                {HERO.subtitle}
              </p>
              <div
                style={enterDelay(270)}
                className="mt-9 flex animate-enter flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Link
                  href={LOGIN.href}
                  className={buttonClasses("action", "lg", "rounded-full! px-6!")}
                >
                  {LOGIN.label}
                  <ArrowRight aria-hidden />
                </Link>
                <Link
                  href={DEMO.href}
                  className={buttonClasses("outline", "lg", "rounded-full! px-6!")}
                >
                  <Play aria-hidden />
                  {DEMO.label}
                </Link>
              </div>
              <p
                style={enterDelay(360)}
                className="mx-auto mt-5 max-w-xl animate-enter text-xs text-text-muted"
              >
                {HERO.status}
              </p>

              <HeroDashboard className="mt-14 [mask-image:linear-gradient(to_bottom,black_62%,transparent)] sm:mt-16" />
            </div>
          </section>
        </div>

        <Section
          id="constat"
          eyebrow={PROBLEMS.eyebrow}
          title={PROBLEMS.title}
          intro={PROBLEMS.intro}
        >
          <ol data-reveal className="group grid gap-4 sm:grid-cols-2">
            {PROBLEMS.items.map((item, index) => (
              <li
                key={item.title}
                style={revealDelay(index)}
                className="flex gap-5 rounded-3xl border border-border bg-surface p-6 transition-[opacity,translate,box-shadow] duration-500 ease-out group-data-[revealed=false]:translate-y-3 group-data-[revealed=false]:opacity-0 hover:shadow-card"
              >
                <span
                  aria-hidden
                  className="text-3xl leading-none font-semibold tracking-tight text-text-subtle tabular"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-text-muted">{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="fonctionnalites" eyebrow={BENEFITS.eyebrow} title={BENEFITS.title} isPanel>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {BENEFITS.items.map((item, index) => {
              const Visual = BENEFIT_VISUALS[item.icon];
              const isHighlight = item.icon === "offline";
              return (
                <li
                  key={item.title}
                  data-reveal
                  style={revealDelay(index)}
                  className={cn("group", REVEAL_CLASSES)}
                >
                  <div
                    className={cn(
                      "flex h-full flex-col gap-5 rounded-3xl border p-4 transition-[box-shadow,translate] duration-300 hover:-translate-y-1 hover:shadow-raised",
                      isHighlight
                        ? "border-transparent bg-surface-inverse text-text-inverse"
                        : "border-border bg-surface",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl p-3",
                        isHighlight ? "bg-text-inverse/5" : "bg-bg-subtle",
                      )}
                    >
                      {Visual ? <Visual /> : null}
                    </div>
                    <div className="px-1 pb-2">
                      <h3 className="font-semibold">{item.title}</h3>
                      <p
                        className={cn(
                          "mt-2 text-sm",
                          isHighlight ? "text-text-inverse-muted" : "text-text-muted",
                        )}
                      >
                        {item.text}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section id="modules" eyebrow={MODULES.eyebrow} title={MODULES.title} intro={MODULES.intro}>
          <div data-reveal className={REVEAL_CLASSES}>
            <ModulesTabs />
          </div>
        </Section>

        <Section
          id="fonctionnement"
          eyebrow={DAY.eyebrow}
          title={DAY.title}
          intro={DAY.intro}
          isPanel
        >
          <ol data-reveal className="group relative grid gap-8 md:grid-cols-4 md:gap-6">
            <span
              aria-hidden
              className="absolute top-5 bottom-5 left-5 w-px origin-top bg-border-strong transition-[scale] duration-[1400ms] ease-out group-data-[revealed=false]:scale-y-0 md:top-5 md:right-[12.5%] md:bottom-auto md:left-[12.5%] md:h-px md:w-auto md:origin-left md:group-data-[revealed=false]:scale-x-0 md:group-data-[revealed=false]:scale-y-100"
            />
            {DAY.steps.map((step, index) => (
              <li
                key={step.moment}
                style={revealDelay(index + 1)}
                className="relative flex gap-5 transition-[opacity,translate] duration-500 ease-out group-data-[revealed=false]:translate-y-3 group-data-[revealed=false]:opacity-0 md:flex-col md:gap-4"
              >
                <span
                  aria-hidden
                  className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary ring-4 ring-bg-subtle tabular md:mx-auto"
                >
                  {index + 1}
                </span>
                <div className="md:text-center">
                  <p className="text-sm font-medium text-brand-text">{step.moment}</p>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-text-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="hors-connexion" eyebrow={OFFLINE.eyebrow} title={OFFLINE.title}>
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div data-reveal className={REVEAL_CLASSES}>
              <p className="text-lg text-text-muted">{OFFLINE.text}</p>
              <ul className="mt-6 space-y-3">
                {OFFLINE.points.map((point) => (
                  <li key={point} className="flex gap-3">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-success" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[1.75rem] border border-border bg-bg-subtle p-4 sm:p-6">
              <SyncDemo />
            </div>
          </div>
        </Section>

        <Section
          id="securite"
          eyebrow={SECURITY.eyebrow}
          title={SECURITY.title}
          intro={SECURITY.intro}
          isPanel
        >
          <div data-reveal className={REVEAL_CLASSES}>
            <SecurityList />
          </div>
        </Section>

        <div className="px-3 pb-3 sm:px-4">
          <section
            aria-labelledby="appel-final-title"
            className="relative overflow-hidden rounded-[2rem] bg-surface-inverse text-text-inverse dark:border dark:border-border-strong"
          >
            <GlassBackdrop isInverse />
            <div
              data-reveal
              className={cn(
                "relative mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24",
                REVEAL_CLASSES,
              )}
            >
              <h2
                id="appel-final-title"
                className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
              >
                {FINAL_CTA.title}
              </h2>
              <p className="mt-4 max-w-xl text-text-inverse-muted">{FINAL_CTA.text}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={LOGIN.href}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-text-inverse px-6 text-base font-semibold text-surface-inverse transition-colors hover:bg-text-inverse/90 focus-visible:outline-text-inverse [&_svg]:size-4"
                >
                  {LOGIN.label}
                  <ArrowRight aria-hidden />
                </Link>
                <Link
                  href={DEMO.href}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-text-inverse/40 px-6 text-base font-medium text-text-inverse transition-colors hover:bg-text-inverse/10 focus-visible:outline-text-inverse [&_svg]:size-4"
                >
                  <Play aria-hidden />
                  {DEMO.label}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
      <RevealObserver />
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  intro,
  isPanel = false,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: string;
  isPanel?: boolean;
  children: ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <div className={cn(isPanel && "px-3 sm:px-4")}>
      <section
        id={id}
        aria-labelledby={titleId}
        className={cn("scroll-mt-20", isPanel && "rounded-[2rem] bg-bg-subtle")}
      >
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal className={cn("mb-10 max-w-2xl sm:mb-12", REVEAL_CLASSES)}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2
              id={titleId}
              className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {title}
            </h2>
            {intro ? <p className="mt-3 text-lg text-text-muted">{intro}</p> : null}
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
